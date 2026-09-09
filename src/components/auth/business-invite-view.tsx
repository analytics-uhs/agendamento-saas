import { beginInvite, leaveInvite, changeInviteAccount } from "@/app/convite/actions";
import { Button } from "@/components/ui/button";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { InviteConfirmation } from "@/components/auth/invite-confirmation";
import { inviteMessage, type PublicInvite } from "@/lib/business-invites";
export function BusinessInviteView({ invite, authenticated, entryToken }: { invite: PublicInvite; authenticated: boolean; entryToken?: string }) {
  return <div className="space-y-6">{invite.status !== "pending" ? <><h1 className="text-2xl font-semibold">Convite</h1><p>{inviteMessage[invite.status]}</p><form action={leaveInvite}><Button type="submit" variant="outline">Ir para login</Button></form></> : <>
    <h1 className="break-words text-2xl font-semibold">{invite.businessName}</h1>
    <p>{authenticated ? `Você está entrando em ${invite.businessName}. Confirme para assumir este negócio.` : "Seu sistema já está sendo preparado 🎉"}</p>
    {!authenticated && <p className="text-muted">Crie seu acesso para começar.</p>}
    {authenticated && !entryToken ? <InviteConfirmation /> : <div className="space-y-3">
      <form action={beginInvite.bind(null, entryToken!, authenticated ? "confirm" : "signup")}><Button type="submit" className="w-full">{authenticated ? "Continuar" : "Criar meu acesso"}</Button></form>
      {!authenticated && <form action={beginInvite.bind(null, entryToken!, "login")}><p className="mb-2 text-sm text-muted">Já tenho conta</p><Button type="submit" variant="outline" className="w-full">Entrar</Button></form>}
    </div>}
    {!authenticated && <GoogleSignIn inviteToken={entryToken} />}
    <form action={authenticated ? changeInviteAccount.bind(null, entryToken) : leaveInvite}><Button type="submit" variant="ghost">{authenticated ? "Usar outra conta" : "Sair do convite"}</Button></form>
  </>}</div>;
}
