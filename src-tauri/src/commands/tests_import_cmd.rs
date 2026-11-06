    use std::sync::atomic::AtomicBool;

    #[test]
    fn store_import_cancel_and_disk_cancel_flip_atomic_flags() {
        let import = AtomicBool::new(false);
        let disk = AtomicBool::new(false);
        store_import_cancel(&import);
        store_disk_cancel(&disk);
        assert!(import.load(std::sync::atomic::Ordering::SeqCst));
        assert!(disk.load(std::sync::atomic::Ordering::SeqCst));
    }
