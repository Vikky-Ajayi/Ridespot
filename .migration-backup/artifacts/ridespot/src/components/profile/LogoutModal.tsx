
import { LogOut, X } from "lucide-react";
import { ModalSheet } from "@/components/app/ModalSheet";

export interface LogoutModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LogoutModal({ open, onClose, onConfirm }: LogoutModalProps) {
  return (
    <ModalSheet open={open} onClose={onClose} panelClassName="overflow-hidden">
      <div className="px-4 pb-6 pt-5">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full bg-[#F3F4F6] text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-3 flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-[#FFF1F2] text-[#EF4444]">
            <LogOut className="size-7" />
          </div>
          <h2 className="mt-6 [font-family:Inter,sans-serif] text-[1.125rem] font-bold leading-none tracking-[-0.03em] text-ink">
            Logout
          </h2>
          <p className="mt-3 max-w-[18rem] text-[1rem] leading-[1.25] text-[#6B7280]">
            Are you sure you want to logout? Once you logout, you need to login again.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-2xl bg-[#FF4545] px-4 py-4 text-[1.02rem] font-semibold text-white"
          >
            Yes, Logout
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-[#F3F4F6] px-4 py-4 text-[1.02rem] font-semibold text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalSheet>
  );
}
