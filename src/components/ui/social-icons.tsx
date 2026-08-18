import type { SVGProps } from "react";

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><rect width="18" height="18" x="3" y="3" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>;
}

export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}><path d="M13.8 22v-8.8h3l.4-3.4h-3.4V7.6c0-1 .3-1.7 1.7-1.7h1.8v-3a24 24 0 0 0-2.6-.1c-2.6 0-4.4 1.6-4.4 4.5v2.5H7.4v3.4h2.9V22h3.5Z" /></svg>;
}

export function WhatsappIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}><path d="M12 2a9.8 9.8 0 0 0-8.5 14.7L2 22l5.4-1.4A10 10 0 1 0 12 2Zm0 17.8a7.8 7.8 0 0 1-4-1.1l-.3-.2-3.2.8.9-3.1-.2-.3a7.7 7.7 0 1 1 6.8 3.9Zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2 0-.4-.1-.6.2l-.7.9c-.1.2-.3.2-.5.1a6.3 6.3 0 0 1-3-2.6c-.2-.4.2-.4.6-1.2.1-.2 0-.4 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5 0-.7.3-.2.3-1 1-1 2.5s1 2.8 1.2 3c.1.2 2 3.1 5 4.2 1.8.8 2.5.8 3.4.7 1-.2 1.4-1 1.6-2 .2-.5.2-1 .1-1.1-.1-.2-.3-.2-.5-.3Z" /></svg>;
}
