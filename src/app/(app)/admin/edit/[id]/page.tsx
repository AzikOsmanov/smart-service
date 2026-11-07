import EditPersonView from "./EditPersonView";

export default async function EditPerson({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  return <EditPersonView id={id} error={error} ok={ok} />;
}
