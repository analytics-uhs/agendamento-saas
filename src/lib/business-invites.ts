export type InviteStatus = "pending" | "invalid" | "expired" | "revoked" | "accepted";
export type PublicInvite = { status: InviteStatus; businessName?: string };
export type BusinessAccess = {
  status: "preparation" | "waiting" | "active";
  owner: { name: string | null; email: string | null; since: string } | null;
  invite: { status: InviteStatus; createdAt: string; expiresAt: string } | null;
};
export const inviteMessage = {
  invalid: "Este convite não é válido.",
  expired: "Este convite expirou. Solicite um novo link.",
  revoked: "Este convite não está mais disponível.",
  accepted: "Este convite já foi utilizado.",
  pending: "Crie seu acesso para começar.",
};
export function inviteError(message: string) {
  if (message.includes("invite_platform_admin")) return "Use uma conta de cliente para aceitar o convite. O Super Admin configura o negócio sem assumir a propriedade.";
  if (message.includes("invite_member_exists")) return "Sua conta já pertence a um negócio. Entre com uma conta sem negócio vinculado para aceitar este convite.";
  if (message.includes("invite_expired")) return inviteMessage.expired;
  if (message.includes("invite_unavailable") || message.includes("invite_owner_exists")) return inviteMessage.revoked;
  return "Não foi possível concluir. Confira seu acesso e tente novamente.";
}
