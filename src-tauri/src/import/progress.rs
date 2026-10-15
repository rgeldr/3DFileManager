pub struct ImportProgress {
    pub current: u32,
    pub total: u32,
    pub message: String,
}

struct ImportProgressCtx<F: FnMut(ImportProgress)> {
    current: u32,
    total: u32,
    on_progress: F,
    pending_message: Option<String>,
}

impl<F: FnMut(ImportProgress)> ImportProgressCtx<F> {
    fn emit_now(&mut self, message: impl Into<String>) {
        self.pending_message = None;
        (self.on_progress)(ImportProgress {
            current: self.current,
            total: self.total.max(1),
            message: message.into(),
        });
    }

    fn emit(&mut self, message: impl Into<String>) {
        self.emit_now(message);
    }

    fn tick(&mut self, message: impl Into<String>) {
        self.current += 1;
        // Every file notifies the caller. The cancel test sets its flag from this
        // callback, and a 250ms throttle let both tiny files finish first.
        self.emit_now(message);
    }

    fn flush(&mut self) {
        if let Some(msg) = self.pending_message.take() {
            self.emit_now(msg);
        }
    }

    fn adjust_total_for_archive_contents(&mut self, inner_file_count: u32) {
        self.total = self.total.saturating_sub(1) + inner_file_count;
    }
}
