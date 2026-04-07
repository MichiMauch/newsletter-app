import AdminNewsletter from '@/components/AdminNewsletter'

export default async function AutomationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminNewsletter initialTab="automations" automationId={Number(id)} />
}
