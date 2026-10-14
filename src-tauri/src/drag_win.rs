// Windows file drag. DoDragDrop has to run on the STA that owns the window,
// which is this process's UI thread. A sync Tauri command runs there.
// The object offers only a wide CF_HDROP of the prepared paths. The drag
// crate's live path is a shell IDataObject (plus a drag bitmap); its CF_HDROP
// helper is unused and its enumerator returns E_NOTIMPL.

use std::sync::atomic::{AtomicUsize, Ordering};

use windows::{
    core::{implement, HRESULT},
    Win32::{
        Foundation::*,
        System::{
            Com::*,
            Memory::*,
            Ole::{
                DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, CF_HDROP, DROPEFFECT,
                DROPEFFECT_COPY, DROPEFFECT_LINK, DROPEFFECT_MOVE,
            },
            SystemServices::{MK_LBUTTON, MODIFIERKEYS_FLAGS},
        },
    },
};

use crate::drag_out::hdrop_bytes;
use crate::drag_session::NativeDrag;

pub fn start_hdrop(paths: &[String]) -> std::result::Result<NativeDrag, String> {
    ensure_ole()?;
    unsafe {
        let data_object: IDataObject = HdropData::new(paths.to_vec()).into();
        let drop_source: IDropSource = HdropSource.into();
        let mut effect = DROPEFFECT::default();
        let code = DoDragDrop(&data_object, &drop_source, DROPEFFECT_COPY, &mut effect);
        Ok(outcome_from(code, effect))
    }
}

fn ensure_ole() -> std::result::Result<(), String> {
    use std::sync::OnceLock;
    static OLE: OnceLock<std::result::Result<(), String>> = OnceLock::new();
    OLE.get_or_init(|| unsafe { OleInitialize(None).map_err(|err| err.to_string()) })
        .clone()
}

fn outcome_from(code: HRESULT, effect: DROPEFFECT) -> NativeDrag {
    let result = if code == DRAGDROP_S_DROP {
        "drop"
    } else if code == DRAGDROP_S_CANCEL {
        "cancel"
    } else {
        "error"
    };
    let bits = effect.0;
    let name = if bits & DROPEFFECT_COPY.0 != 0 {
        "copy"
    } else if bits & DROPEFFECT_MOVE.0 != 0 {
        "move"
    } else if bits & DROPEFFECT_LINK.0 != 0 {
        "link"
    } else {
        "none"
    };
    NativeDrag {
        result: result.to_string(),
        effect: name.to_string(),
        finished: true,
        detail: format!("code={:#x} bits={bits}", code.0 as u32),
    }
}

fn hdrop_format() -> FORMATETC {
    FORMATETC {
        cfFormat: CF_HDROP.0,
        ptd: std::ptr::null_mut(),
        dwAspect: DVASPECT_CONTENT.0,
        lindex: -1,
        tymed: TYMED_HGLOBAL.0 as u32,
    }
}

fn wants_hdrop(format: &FORMATETC) -> bool {
    format.cfFormat == CF_HDROP.0
        && (format.dwAspect == DVASPECT_CONTENT.0 || format.dwAspect == 0)
        && (format.tymed == 0 || format.tymed & (TYMED_HGLOBAL.0 as u32) != 0)
}

fn hdrop_handle(paths: &[String]) -> windows::core::Result<HGLOBAL> {
    let bytes = hdrop_bytes(paths);
    unsafe {
        let handle = GlobalAlloc(GMEM_MOVEABLE, bytes.len())?;
        let ptr = GlobalLock(handle);
        if ptr.is_null() {
            return Err(E_OUTOFMEMORY.into());
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr.cast::<u8>(), bytes.len());
        // Unlocking the last lock returns FALSE even when it succeeded.
        let _ = GlobalUnlock(handle);
        Ok(handle)
    }
}

#[implement(IDataObject)]
struct HdropData {
    paths: Vec<String>,
}

impl HdropData {
    fn new(paths: Vec<String>) -> Self {
        Self { paths }
    }
}

#[allow(non_snake_case)]
impl IDataObject_Impl for HdropData {
    fn GetData(&self, pformatetc: *const FORMATETC) -> windows::core::Result<STGMEDIUM> {
        let Some(format) = (unsafe { pformatetc.as_ref() }) else {
            return Err(E_INVALIDARG.into());
        };
        if !wants_hdrop(format) {
            return Err(DV_E_FORMATETC.into());
        }
        Ok(STGMEDIUM {
            tymed: TYMED_HGLOBAL.0 as u32,
            u: STGMEDIUM_0 {
                hGlobal: hdrop_handle(&self.paths)?,
            },
            pUnkForRelease: std::mem::ManuallyDrop::new(None),
        })
    }

    fn GetDataHere(&self, _pformatetc: *const FORMATETC, _pmedium: *mut STGMEDIUM) -> windows::core::Result<()> {
        Err(DV_E_FORMATETC.into())
    }

    fn QueryGetData(&self, pformatetc: *const FORMATETC) -> HRESULT {
        match unsafe { pformatetc.as_ref() } {
            Some(format) if wants_hdrop(format) => S_OK,
            _ => DV_E_FORMATETC,
        }
    }

    fn GetCanonicalFormatEtc(&self, _in: *const FORMATETC, out: *mut FORMATETC) -> HRESULT {
        if !out.is_null() {
            unsafe { (*out).ptd = std::ptr::null_mut() };
        }
        E_NOTIMPL
    }

    fn SetData(&self, _pformatetc: *const FORMATETC, _pmedium: *const STGMEDIUM, _frelease: BOOL) -> windows::core::Result<()> {
        Err(E_NOTIMPL.into())
    }

    fn EnumFormatEtc(&self, direction: u32) -> windows::core::Result<IEnumFORMATETC> {
        if direction != 1 {
            return Err(E_NOTIMPL.into());
        }
        Ok(HdropFormats::new(0).into())
    }

    fn DAdvise(&self, _pformatetc: *const FORMATETC, _advf: u32, _sink: Option<&IAdviseSink>) -> windows::core::Result<u32> {
        Err(OLE_E_ADVISENOTSUPPORTED.into())
    }

    fn DUnadvise(&self, _connection: u32) -> windows::core::Result<()> {
        Err(OLE_E_ADVISENOTSUPPORTED.into())
    }

    fn EnumDAdvise(&self) -> windows::core::Result<IEnumSTATDATA> {
        Err(OLE_E_ADVISENOTSUPPORTED.into())
    }
}

#[implement(IEnumFORMATETC)]
struct HdropFormats {
    index: AtomicUsize,
}

impl HdropFormats {
    fn new(index: usize) -> Self {
        Self {
            index: AtomicUsize::new(index),
        }
    }
}

#[allow(non_snake_case)]
impl IEnumFORMATETC_Impl for HdropFormats {
    fn Next(&self, celt: u32, rgelt: *mut FORMATETC, fetched: *mut u32) -> windows::core::Result<()> {
        if rgelt.is_null() || celt == 0 {
            return Err(E_INVALIDARG.into());
        }
        let current = self.index.load(Ordering::SeqCst);
        if current > 0 {
            if !fetched.is_null() {
                unsafe { *fetched = 0 };
            }
            return Err(S_FALSE.into());
        }
        unsafe { *rgelt = hdrop_format() };
        self.index.store(1, Ordering::SeqCst);
        if !fetched.is_null() {
            unsafe { *fetched = 1 };
        }
        if celt > 1 {
            Err(S_FALSE.into())
        } else {
            Ok(())
        }
    }

    fn Skip(&self, celt: u32) -> windows::core::Result<()> {
        if celt == 0 {
            return Ok(());
        }
        let current = self.index.load(Ordering::SeqCst);
        self.index.store(current.saturating_add(celt as usize), Ordering::SeqCst);
        Ok(())
    }

    fn Reset(&self) -> windows::core::Result<()> {
        self.index.store(0, Ordering::SeqCst);
        Ok(())
    }

    fn Clone(&self) -> windows::core::Result<IEnumFORMATETC> {
        Ok(HdropFormats::new(self.index.load(Ordering::SeqCst)).into())
    }
}

#[implement(IDropSource)]
struct HdropSource;

#[allow(non_snake_case)]
impl IDropSource_Impl for HdropSource {
    fn QueryContinueDrag(&self, escape: BOOL, keys: MODIFIERKEYS_FLAGS) -> HRESULT {
        if escape.as_bool() {
            DRAGDROP_S_CANCEL
        } else if (keys & MK_LBUTTON) == MODIFIERKEYS_FLAGS(0) {
            DRAGDROP_S_DROP
        } else {
            S_OK
        }
    }

    fn GiveFeedback(&self, _effect: DROPEFFECT) -> HRESULT {
        DRAGDROP_S_USEDEFAULTCURSORS
    }
}
