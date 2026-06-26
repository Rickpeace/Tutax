"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTemplate } from "@/app/admin/actions";

export function NewTemplateButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" /> Neues Template
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Standard-Template</DialogTitle>
        </DialogHeader>
        <form action={createTemplate} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Titel</Label>
            <Input
              id="title"
              name="title"
              autoFocus
              required
              placeholder="z. B. DATEV SmartLogin einrichten"
            />
          </div>
          <DialogFooter>
            <Button type="submit">Anlegen &amp; bearbeiten</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
