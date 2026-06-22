
import { Pencil, UserRound } from "lucide-react";

export interface ProfileCardProps {
  name: string;
  email: string;
  onEdit: () => void;
}

export function ProfileCard({ name, email, onEdit }: ProfileCardProps) {
  return (
    <div className="rounded-[24px] bg-white p-3 shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-full bg-[#FF5656] text-white">
          <UserRound className="size-5 fill-white text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[1.12rem] font-bold leading-tight text-ink">{name}</p>
          <p className="mt-1 truncate text-[0.98rem] font-medium text-[#6B7280]">{email}</p>
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="flex size-11 items-center justify-center rounded-2xl bg-[#F5F6F8] text-[#00A856]"
        >
          <Pencil className="size-5" />
        </button>
      </div>
    </div>
  );
}
