import { render } from '@react-email/render'
import { Newsletter, type NewsletterProps } from '@/emails/Newsletter'
import {
  NewsletterMultiBlock,
  type NewsletterMultiBlockProps,
} from '@/emails/NewsletterMultiBlock'

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
