"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchModal } from "@/components/sprint-board/SearchModal";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener("valk:openGlobalSearch", onOpen);
    return () => window.removeEventListener("valk:openGlobalSearch", onOpen);
  }, []);

  useEffect(() => {
    function onClose() { setOpen(false); }
    window.addEventListener("valk:closeGlobalSearch", onClose);
    return () => window.removeEventListener("valk:closeGlobalSearch", onClose);
  }, []);

  return (
    <SearchModal
      open={open}
      onClose={handleClose}
      onSelectTicket={() => {}}
    />
  );
}
