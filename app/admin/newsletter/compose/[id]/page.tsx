import DraftEditor from '@/components/admin/compose/DraftEditor'

export default async function ComposeDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DraftEditor draftId={id} />
}
