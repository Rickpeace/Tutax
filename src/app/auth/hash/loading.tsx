// Boundary für den Bestätigungs-Endpunkt (liest searchParams -> dynamisch unter PPR).
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">Anmeldung wird bestätigt …</p>
    </div>
  );
}
