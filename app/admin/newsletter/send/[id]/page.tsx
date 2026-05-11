import AdminNewsletter from '@/components/AdminNewsletter'

export default async function SendPreflightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminNewsletter initialTab="send" initialSubTab="list" sendDraftId={id} />
}
