"use client";

import { useState } from "react";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";

export function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Open confirm dialog
      </button>
      <ConfirmActionDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Retire “Grounds”?"
        description="It won’t be offered for new reports. Existing work orders keep the label."
        confirmLabel="Retire"
        tone="danger"
        onConfirm={async () => null}
      />
    </>
  );
}
