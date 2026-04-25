import { render } from '@react-email/render'
import { Newsletter, type NewsletterProps } from '@/emails/Newsletter'
import {
  NewsletterMultiBlock,
  type NewsletterMultiBlockProps,
} from '@/emails/NewsletterMultiBlock'
import {
  ConfirmationEmail,
  AlreadySubscribedEmail,
  type ConfirmationEmailProps,
  type AlreadySubscribedEmailProps,
} from '@/emails/Transactional'

export async function renderNewsletterHtml(props: NewsletterProps): Promise<string> {
  return render(<Newsletter {...props} />)
}

export async function renderNewsletterText(props: NewsletterProps): Promise<string> {
  return render(<Newsletter {...props} />, { plainText: true })
}

export async function renderMultiBlockHtml(props: NewsletterMultiBlockProps): Promise<string> {
  return render(<NewsletterMultiBlock {...props} />)
}

export async function renderMultiBlockText(props: NewsletterMultiBlockProps): Promise<string> {
  return render(<NewsletterMultiBlock {...props} />, { plainText: true })
}

export async function renderConfirmationEmail(props: ConfirmationEmailProps) {
  const node = <ConfirmationEmail {...props} />
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })])
  return { html, text }
}

export async function renderAlreadySubscribedEmail(props: AlreadySubscribedEmailProps) {
  const node = <AlreadySubscribedEmail {...props} />
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })])
  return { html, text }
}
