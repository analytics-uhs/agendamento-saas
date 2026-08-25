"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, CalendarDays, Check, Clock3 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FOUNDER_OFFER, MARKETING_TRIAL_HREF, type FounderOfferAvailability } from "@/lib/marketing";
import "./marketing-landing.css";

const DEMO_STEPS = ["Acessa", "Escolhe", "Confirma", "Agenda atualiza", "Notificação"] as const;

const FAQ = [
  ["Preciso instalar algum aplicativo?", "Não. O AgendaFácil funciona no navegador. Se quiser, o painel administrativo também pode ser instalado como PWA."],
  ["Meus clientes precisam criar conta?", "Não. Eles acessam o link, escolhem as opções, informam nome e WhatsApp e confirmam."],
  ["Funciona para diferentes negócios?", "Sim. Os nomes, opções e durações podem ser configurados para diferentes operações."],
  ["Posso configurar meus horários?", "Sim. É possível configurar os sete dias e múltiplos intervalos no mesmo dia."],
  ["Consigo bloquear períodos?", "Sim. Bloqueios retiram períodos específicos da disponibilidade pública."],
  ["Posso criar reservas recorrentes?", "Sim. Quem administra pode criar reservas semanais permanentes ou limitadas."],
  ["Como funciona o teste grátis?", "São 15 dias para conhecer o produto sem informar cartão. Depois você decide se quer continuar."],
  ["O preço de fundador permanece?", "Sim, para os primeiros 50 negócios enquanto a assinatura permanecer ativa."],
] as const;

function Brand({ priority = false, variant = "dark" }: { priority?: boolean; variant?: "dark" | "light" }) {
  const logoSrc = variant === "light" ? "/brand/agendafacil-logo-claro.png" : "/brand/agendafacil-logo-escuro.png";
  return <span className="sm-brand"><Image className="sm-brand-logo" src={logoSrc} alt="AgendaFácil" width={500} height={500} sizes="42px" priority={priority} /> <span aria-hidden="true">AgendaFácil</span></span>;
}

function TrialLink({ className = "sm-cta", children = "Começar 15 dias grátis sem cartão" }: { className?: string; children?: React.ReactNode }) {
  return <Link className={className} href={MARKETING_TRIAL_HREF} data-marketing-cta="trial">{children}</Link>;
}

function PhoneMockup({ complete = false }: { complete?: boolean }) {
  return <div className="sm-phone" aria-label="Exemplo da página pública do AgendaFácil">
    <div className="sm-phone-screen">
      <div className="sm-phone-head"><div className="sm-business-logo">AC</div><div><b>Arena Central</b><small>Agende seu horário</small></div></div>
      <div className="sm-label">Escolha uma opção</div>
      <div className={`sm-option ${complete ? "is-selected" : ""}`}>Quadra frente {complete ? "✓" : ""}</div>
      {!complete && <div className="sm-option">Quadra fundos</div>}
      <div className="sm-label">Escolha a data</div>
      <div className="sm-days"><div className="sm-day">SEG<b>24</b></div><div className={`sm-day ${complete ? "is-selected" : ""}`}>TER<b>25</b></div><div className="sm-day">QUA<b>26</b></div><div className="sm-day">QUI<b>27</b></div></div>
      {complete && <><div className="sm-label">Horários disponíveis</div><div className="sm-slots"><div className="sm-slot">14:00</div><div className="sm-slot is-selected">15:00</div><div className="sm-slot">16:00</div></div></>}
    </div>
  </div>;
}

function AdminMockup({ highlighted = false, compact = false, className = "" }: { highlighted?: boolean; compact?: boolean; className?: string }) {
  return <div className={`sm-browser ${compact ? "sm-demo-admin" : ""} ${className}`} aria-label="Exemplo da agenda administrativa do AgendaFácil">
    <div className="sm-browser-top"><i /><i /><i /><span>AgendaFácil · Agenda do dia</span></div>
    <div className="sm-admin-body">
      <aside className="sm-side"><b>Início</b><span>Agenda</span><span>Configuração</span><span>Horários</span><span>Aparência</span></aside>
      <div className="sm-agenda">
        <div className="sm-agenda-head"><div><small>Terça-feira, 25 de agosto</small><h4>Agenda do dia</h4></div>{!compact && <span className="sm-mini-button">Novo agendamento</span>}</div>
        <div className="sm-stats"><div className="sm-stat"><b>8</b><small>Hoje</small></div><div className="sm-stat"><b>6</b><small>Agendados</small></div><div className="sm-stat"><b>1</b><small>Concluído</small></div><div className="sm-stat"><b>1</b><small>Bloqueio</small></div></div>
        {!compact && <div className="sm-appt"><time>09:00</time><div><b>André Lima</b><small>Quadra fundos · Tênis</small></div><span className="sm-status">Agendado</span></div>}
        <div className={`sm-appt ${highlighted ? "sm-new-row" : ""}`}><time>15:00</time><div><b>Marina Souza</b><small>Quadra frente · Futebol</small></div><span className="sm-status">{highlighted ? "Novo" : "Agendado"}</span></div>
        {!compact && <div className="sm-appt"><time>18:00</time><div><b>Reserva recorrente</b><small>Quadra 2 · Beach Tennis</small></div><span className="sm-status">Agendado</span></div>}
      </div>
    </div>
  </div>;
}

function NotificationMockup({ className = "" }: { className?: string }) {
  return <div className={`sm-notification ${className}`}><span className="sm-notification-icon"><Bell aria-hidden="true" /></span><span><b>Novo agendamento</b><small>Marina agendou Quadra frente · Futebol amanhã às 15:00.</small></span></div>;
}

function DemoScene({ index }: { index: number }) {
  if (index === 0) return <><PhoneMockup /><div className="sm-demo-caption">Cliente abre o link — sem criar conta</div></>;
  if (index === 1) return <><PhoneMockup complete /><span className="sm-tap" aria-hidden="true" /><div className="sm-demo-caption">Escolhe entre horários realmente disponíveis</div></>;
  if (index === 2) return <><div className="sm-demo-confirm"><div className="sm-check"><Check aria-hidden="true" /></div><h3>Agendamento confirmado</h3><p>Terça-feira, 25/08, às 15:00.</p><div className="sm-demo-summary"><b>Quadra frente</b><small>Futebol · 1 hora</small></div><div className="sm-demo-summary"><b>Marina Souza</b><small>WhatsApp informado</small></div></div><div className="sm-demo-caption">Nome e WhatsApp. Reserva concluída.</div></>;
  if (index === 3) return <><AdminMockup compact highlighted /><div className="sm-demo-caption">O novo horário entra na agenda administrativa</div></>;
  return <><AdminMockup compact highlighted /><NotificationMockup /><div className="sm-demo-caption">O painel e o sino são atualizados</div></>;
}

function AutoDemo({ reducedMotion }: { reducedMotion: boolean }) {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || !visible) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % DEMO_STEPS.length), 2000);
    return () => window.clearInterval(timer);
  }, [reducedMotion, visible]);

  return <div className="sm-demo-frame sm-reveal" data-demo-visible={visible} ref={sectionRef}>
    <div className="sm-demo-progress" aria-label="Etapas da demonstração">
      {DEMO_STEPS.map((step, index) => <button key={step} type="button" className={`sm-demo-step ${active === index ? "is-active" : ""}`} aria-pressed={active === index} onClick={() => setActive(index)}><span /><em>{step}</em></button>)}
    </div>
    <div className="sm-demo-stage" aria-label={`${DEMO_STEPS[active]}: demonstração do fluxo de agendamento`}>
      {DEMO_STEPS.map((_, index) => <div key={index} className={`sm-demo-scene ${active === index ? "is-active" : ""}`} aria-hidden={active !== index}><DemoScene index={index} /></div>)}
    </div>
  </div>;
}

function FaqItem({ index, question, answer, open, onToggle }: { index: number; question: string; answer: string; open: boolean; onToggle: () => void }) {
  const answerId = `marketing-faq-${index}`;
  return <div className="sm-faq-item"><button className="sm-faq-button" type="button" aria-expanded={open} aria-controls={answerId} onClick={onToggle}>{question}</button><div id={answerId} className={`sm-faq-answer ${open ? "is-open" : ""}`} aria-hidden={!open}><div><p>{answer}</p></div></div></div>;
}

export function MarketingLanding({ founderOffer }: { founderOffer: FounderOfferAvailability }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const progressStyle = { "--founder-progress": `${founderOffer.occupiedPercentage}%` } as CSSProperties;
  const founderOfferSoldOut = founderOffer.availableSpots === 0;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    updateMotion();
    media.addEventListener("change", updateMotion);
    if (!media.matches) requestAnimationFrame(() => { root.classList.add("sm-motion"); requestAnimationFrame(() => root.classList.add("sm-ready")); });
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    root.querySelectorAll(".sm-reveal").forEach((element) => observer.observe(element));
    return () => { media.removeEventListener("change", updateMotion); observer.disconnect(); };
  }, []);

  return <div id="agenda-motion" ref={rootRef}>
    <a className="sm-skip-link" href="#conteudo">Ir para o conteúdo</a>
    <header className="sm-hero">
      <div className="sm-shell sm-header"><Link href="/" aria-label="AgendaFácil — início"><Brand priority /></Link><nav className="sm-nav" aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#preco">Preço</a><TrialLink>Começar grátis</TrialLink></nav></div>
      <div className="sm-shell sm-hero-grid">
        <div className="sm-hero-copy"><h1>Seus clientes <span>agendam.</span><br />Seu dia continua.</h1><p className="sm-hero-lead">O AgendaFácil mostra seus horários disponíveis e recebe reservas 24 horas por dia — mesmo quando você não pode parar para responder.</p><div className="sm-hero-actions"><TrialLink /></div><div className="sm-proof"><span><i />Página própria</span><span><i />Disponibilidade real</span><span><i />Cliente sem cadastro</span></div></div>
        <div className="sm-hero-product" aria-label="Página pública conectada à agenda administrativa e às notificações"><div className="sm-product-field" /><AdminMockup className="sm-admin-window" /><div className="sm-hero-phone"><PhoneMockup complete /></div><NotificationMockup className="sm-hero-notification" /><svg className="sm-flow-svg" viewBox="0 0 680 570" aria-hidden="true"><path className="sm-flow-path" d="M130 430 C230 340 310 380 370 290 S500 175 600 135" /><circle className="sm-flow-dot" r="7"><animateMotion dur="4.5s" repeatCount="indefinite" path="M130 430 C230 340 310 380 370 290 S500 175 600 135" /></circle><circle className="sm-flow-dot" r="4"><animateMotion begin="-2.2s" dur="4.5s" repeatCount="indefinite" path="M130 430 C230 340 310 380 370 290 S500 175 600 135" /></circle></svg></div>
      </div>
    </header>

    <main id="conteudo">
      <section className="sm-section sm-before"><div className="sm-shell sm-before-grid"><div className="sm-reveal sm-reveal-left"><h2>Pare de organizar sua agenda mensagem por mensagem.</h2><p className="sm-section-lead">O WhatsApp continua sendo um canal de conversa. A disponibilidade e a reserva deixam de depender de uma resposta manual.</p></div><div className="sm-conversation sm-reveal sm-reveal-right"><div className="sm-message-stack"><div className="sm-message">Tem horário hoje?</div><div className="sm-message">E amanhã?</div><div className="sm-message">Às 15h tem?</div><div className="sm-message">Pode reservar?</div></div><div className="sm-switch-line" /><div className="sm-confirm-card"><div className="sm-check"><Check aria-hidden="true" /></div><h3>Agendamento confirmado</h3><p>Terça-feira, 25/08, às 15:00.</p><div className="sm-confirm-detail"><span>Quadra frente · Futebol</span><b>1 hora</b></div></div></div></div></section>

      <section className="sm-section sm-auto-demo" id="como-funciona"><div className="sm-shell"><div className="sm-demo-head sm-reveal"><h2>Veja o sistema em movimento.</h2><p>Em dez segundos: o cliente encontra um horário, confirma e a nova reserva aparece para quem administra o negócio.</p></div><AutoDemo reducedMotion={reducedMotion} /></div></section>

      <section className="sm-anchor-24"><div className="sm-shell sm-anchor-grid sm-reveal"><div className="sm-24">24h</div><div className="sm-anchor-copy"><h2>Seu negócio pode estar fechado. Sua agenda não precisa estar.</h2><p>Clientes continuam consultando horários futuros e agendando quando for melhor para eles — sem depender de alguém disponível para responder naquele momento.</p></div></div></section>

      <section className="sm-section sm-experience" id="recursos"><div className="sm-shell"><div className="sm-reveal"><h2>Quatro passos para o cliente.<br />Controle completo para você.</h2><p className="sm-section-lead">A experiência pública é curta. A operação administrativa continua organizada.</p></div><div className="sm-experience-grid"><div className="sm-client-stage sm-reveal sm-reveal-left"><PhoneMockup complete /><div className="sm-no-account">Abre o link → escolhe → confirma</div></div><div className="sm-feature-lines sm-reveal sm-reveal-right"><div className="sm-feature-line"><CalendarDays aria-hidden="true" /><div><b>Página personalizada</b><p>Logo, cores e informações do negócio em uma experiência sem cadastro.</p></div></div><div className="sm-feature-line"><Check aria-hidden="true" /><div><b>Disponibilidade automática</b><p>Funcionamento, reservas e bloqueios definem o que pode ser escolhido.</p></div></div><div className="sm-feature-line"><Clock3 aria-hidden="true" /><div><b>Nome e WhatsApp</b><p>Somente os dados essenciais para concluir a reserva.</p></div></div></div></div></div></section>

      <section className="sm-flexibility"><div className="sm-shell sm-flex-head sm-reveal"><h2 className="sm-display">Uma agenda que se adapta ao seu negócio.</h2><p>Quadras, aulas, serviços, espaços ou atendimentos. Você define os nomes, as opções, as durações e os horários.</p></div><div className="sm-marquee" aria-hidden="true"><span>quadras</span><span>serviços</span><span>aulas</span><span>espaços</span><span>horários</span><span>atendimentos</span><span>quadras</span><span>serviços</span><span>aulas</span><span>espaços</span><span>horários</span><span>atendimentos</span></div><div className="sm-shell sm-config-strip sm-reveal"><div className="sm-config-item"><b>Suas opções</b><small>Nomes configuráveis</small></div><div className="sm-config-item"><b>Sua duração</b><small>Fixa, blocos ou por opção</small></div><div className="sm-config-item"><b>Seus horários</b><small>Múltiplos intervalos</small></div><div className="sm-config-item"><b>Sua aparência</b><small>Logo, paleta e tema</small></div></div></section>

      <section className="sm-section sm-admin-story"><div className="sm-shell sm-admin-story-grid"><div className="sm-reveal sm-reveal-left"><h2>Seu dia inteiro, organizado em um só lugar.</h2><p className="sm-section-lead">Veja a agenda, receba novos horários e faça ajustes sem perder o histórico.</p><div className="sm-admin-copy-list"><div className="sm-admin-copy-item"><i /><span>Bloqueie períodos quando precisar.</span></div><div className="sm-admin-copy-item"><i /><span>Crie reservas recorrentes para clientes fixos.</span></div><div className="sm-admin-copy-item"><i /><span>Abra lembretes preparados no WhatsApp.</span></div><div className="sm-admin-copy-item"><i /><span>Use no navegador ou instale como aplicativo.</span></div></div></div><div className="sm-reveal sm-reveal-right"><AdminMockup highlighted /></div></div></section>

      <section className="sm-section sm-founders" id="preco"><div className="sm-shell"><div className="sm-offer sm-reveal"><div><span className="sm-offer-tag">LOTE FUNDADORES · PRIMEIROS 50 NEGÓCIOS</span><h2>Comece sem compromisso. Continue como fundador.</h2><p>Experimente por 15 dias sem cartão. Se decidir continuar, o valor de fundador permanece enquanto sua assinatura estiver ativa.</p><div className="sm-offer-benefits"><div className="sm-offer-benefit"><i>✓</i>15 dias grátis</div><div className="sm-offer-benefit"><i>✓</i>Sem cartão</div><div className="sm-offer-benefit"><i>✓</i>Cancele quando quiser</div><div className="sm-offer-benefit"><i>✓</i>Condição mantida enquanto ativo</div></div></div><div className="sm-price-panel"><div className="sm-official">Preço oficial: <s>R$ {FOUNDER_OFFER.officialPrice}/mês</s></div><div className="sm-price"><sup>R$</sup>{FOUNDER_OFFER.currentPrice} <small>/mês</small></div><div className="sm-price-note">para os primeiros {founderOffer.totalSpots} negócios</div><div className="sm-seats-copy"><b>{founderOffer.occupiedSpots} de {founderOffer.totalSpots} ocupadas</b><span className={founderOfferSoldOut ? "is-sold-out" : undefined}>{founderOfferSoldOut ? "Lote Fundadores esgotado" : `${founderOffer.availableSpots} vagas disponíveis`}</span></div><div className="sm-seat-meter" style={progressStyle}><div className="sm-seat-progress" role="progressbar" aria-label={`${founderOffer.occupiedSpots} de ${founderOffer.totalSpots} vagas ocupadas`} aria-valuenow={founderOffer.occupiedSpots} aria-valuemin={0} aria-valuemax={founderOffer.totalSpots}><span /></div><div className="sm-seat-percent"><strong>{founderOffer.occupiedPercentage}% ocupadas</strong><span>Oferta para os primeiros {founderOffer.totalSpots} negócios</span></div></div><TrialLink /><div className="sm-next-price">Próximo lote: R$ {FOUNDER_OFFER.nextPrice}/mês. Depois, preço oficial de R$ {FOUNDER_OFFER.officialPrice}/mês.</div></div></div></div></section>

      <section className="sm-section sm-faq"><div className="sm-shell"><div className="sm-faq-head sm-reveal"><h2>Perguntas antes de começar.</h2><p className="sm-section-lead">Respostas diretas sobre o produto atual, sem uma parede de texto.</p></div><div className="sm-faq-grid"><div>{FAQ.slice(0, 4).map(([question, answer], index) => <FaqItem key={question} index={index} question={question} answer={answer} open={openFaq === index} onToggle={() => setOpenFaq(openFaq === index ? null : index)} />)}</div><div>{FAQ.slice(4).map(([question, answer], offset) => { const index = offset + 4; return <FaqItem key={question} index={index} question={question} answer={answer} open={openFaq === index} onToggle={() => setOpenFaq(openFaq === index ? null : index)} />; })}</div></div></div></section>

      <section className="sm-final"><div className="sm-shell sm-final-inner sm-reveal"><h2>Sua próxima reserva pode acontecer sem você responder uma mensagem.</h2><p>Crie sua agenda, compartilhe o link e deixe seus clientes encontrarem o melhor horário.</p><TrialLink /></div></section>
    </main>
    <footer className="sm-footer"><div className="sm-shell sm-footer-row"><div className="sm-footer-brand"><Brand variant="light" /><span>Agendamento simples para negócios em movimento.</span></div><div className="sm-footer-meta"><span>© 2026 AgendaFácil. Todos os direitos reservados.</span><a href="https://www.uhsanalytics.com.br/" target="_blank" rel="noopener noreferrer">Desenvolvido por UHS Analytics</a></div></div></footer>
  </div>;
}
