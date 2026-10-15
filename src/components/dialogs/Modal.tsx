import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export function Modal({ children }: { children: ReactNode }) {
  return createPortal(<div className="modal-back">{children}</div>, document.body);
}
