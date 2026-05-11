import SendPreflight from '@/components/admin/send/SendPreflight'

export default async function SendPreflightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-[1100px] p-6">
      <SendPreflight draftId={id} />
    </div>
  )
}
