// @ts-nocheck
import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-moss-300">
      <Loader2 size={16} className="animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
