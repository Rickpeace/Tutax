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
import { createTutorial } from "@/app/app/actions";

export function NewTutorialButton({
  variant = "default",
  categoryId = null,
  compact = false,
  label = "Neues Tutorial",
}: {
  variant?: "default" | "outline";
  categoryId?: string | null;
  compact?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          compact ? (
            <Button variant="ghost" size="sm" className="text-primary">
              <Plus className="size-4" /> Tutorial
            </Button>
          ) : (
            <Button variant={variant}>
              <Plus className="size-4" /> {label}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Tutorial</DialogTitle>
        </DialogHeader>
        <form action={createTutorial} className="space-y-4">
          <input type="hidden" name="category_id" value={categoryId ?? ""} />
          <div className="space-y-1.5">
            <Label htmlFor="title">Titel</Label>
            <Input
              id="title"
              name="title"
              placeholder="z. B. SmartLogin einrichten"
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit">Erstellen &amp; bearbeiten</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
