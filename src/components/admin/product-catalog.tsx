"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { saveCategory, saveProduct, setProductActive } from "@/app/admin/produtos/actions";
import { CATALOG_PAGE_SIZE, PRODUCT_UNITS, emptyProduct, formatCatalogBRL, parseCategoryInput, parseProductInput, productToInput, type CatalogFilters, type Product, type ProductCategory, type ProductInput } from "@/lib/product-catalog";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";

// Operate: existing Admin vocabulary; one compact list, clear prices and actions.
// No stock counters. Forms preserve context and use the incumbent modal/fields.
function CatalogDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = content.current?.closest('[role="dialog"]');
    const selector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex="0"]';
    (content.current?.querySelector("input") as HTMLElement | null)?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter((item) => item.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); previous?.focus(); };
  }, []);
  return <Modal title={title} onClose={onClose}><div ref={content} className="p-4 sm:p-5">{children}</div></Modal>;
}

function ProductEditor({ product, categories, onClose, onSaved }: { product: Product | null; categories: ProductCategory[]; onClose: () => void; onSaved: (message: string) => void }) {
  const initial = product ? productToInput(product) : emptyProduct;
  const [form, setForm] = useState<ProductInput>({ ...initial });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const close = useCallback(() => {
    if (!pending && (JSON.stringify(form) === JSON.stringify(initial) || window.confirm("Descartar as alterações não salvas?"))) onClose();
  }, [pending, form, initial, onClose]);
  function field(key: keyof ProductInput, value: string | boolean) { setForm((current) => ({ ...current, [key]: value })); }
  return <CatalogDialog title={product ? "Editar produto" : "Novo produto"} onClose={close}>
    <form className="space-y-5" onSubmit={(event) => {
      event.preventDefault(); setError("");
      try { parseProductInput(form); } catch (validation) { setError((validation as Error).message); return; }
      startTransition(async () => {
        try {
          const result = await saveProduct(product?.id ?? null, form);
          if (result.ok) onSaved(result.message); else setError(result.message);
        } catch { setError("Não foi possível salvar agora. Tente novamente."); }
      });
    }}>
      <div className="space-y-2"><Label htmlFor="product-name">Nome *</Label><Input id="product-name" required maxLength={160} value={form.name} onChange={(e) => field("name", e.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="product-category">Categoria</Label><Select id="product-category" value={form.category_id} onChange={(e) => field("category_id", e.target.value)}><option value="">Sem categoria</option>{categories.filter((category) => category.active || category.id === product?.category_id).map((category) => <option key={category.id} value={category.id}>{category.name}{!category.active ? " (inativa)" : ""}</option>)}</Select></div>
        <div className="space-y-2"><Label htmlFor="product-unit">Unidade *</Label><Select id="product-unit" value={form.unit} onChange={(e) => field("unit", e.target.value)}>{Object.entries(PRODUCT_UNITS).map(([code, label]) => <option key={code} value={code}>{label} ({code})</option>)}</Select></div>
        <div className="space-y-2"><Label htmlFor="product-sku">Código interno / SKU</Label><Input id="product-sku" maxLength={64} value={form.sku} onChange={(e) => field("sku", e.target.value)} autoCapitalize="characters" /></div>
        <div className="space-y-2"><Label htmlFor="product-barcode">Código de barras</Label><Input id="product-barcode" maxLength={80} value={form.barcode} onChange={(e) => field("barcode", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="product-cost">Preço de custo (R$)</Label><Input id="product-cost" inputMode="decimal" placeholder="Opcional" value={form.cost_price} onChange={(e) => field("cost_price", e.target.value)} aria-describedby="product-cost-help" /><p id="product-cost-help" className="text-xs text-muted">Custo de referência, não custo médio.</p></div>
        <div className="space-y-2"><Label htmlFor="product-sale">Preço de venda (R$) *</Label><Input id="product-sale" inputMode="decimal" required placeholder="0,00" value={form.sale_price} onChange={(e) => field("sale_price", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="product-minimum">Estoque mínimo</Label><Input id="product-minimum" inputMode="decimal" required value={form.minimum_stock} onChange={(e) => field("minimum_stock", e.target.value)} aria-describedby="product-minimum-help" /><p id="product-minimum-help" className="text-xs text-muted">Configuração para uso futuro. Não representa o saldo atual.</p></div>
        <div className="space-y-2"><Label htmlFor="product-status">Status</Label><Select id="product-status" value={String(form.active)} onChange={(e) => field("active", e.target.value === "true")}><option value="true">Ativo</option><option value="false">Inativo</option></Select></div>
      </div>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={close} disabled={pending}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar produto"}</Button></div>
    </form>
  </CatalogDialog>;
}

function CategoryManager({ categories, onClose, onSaved }: { categories: ProductCategory[]; onClose: () => void; onSaved: (category: ProductCategory, message: string) => void }) {
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const dirty = name !== (editing?.name ?? "");
  const close = useCallback(() => { if (!pending && (!dirty || window.confirm("Descartar as alterações não salvas?"))) onClose(); }, [pending, dirty, onClose]);
  function save(category: ProductCategory | null, values: { name: string; active: boolean }, reset: boolean) {
    setError(""); setMessage("");
    try { parseCategoryInput(values); } catch (validation) { setError((validation as Error).message); return; }
    startTransition(async () => {
      try {
        const result = await saveCategory(category?.id ?? null, values);
        if (result.ok && result.data) {
          onSaved(result.data, result.message); setMessage(result.message);
          if (reset) { setEditing(null); setName(""); inputRef.current?.querySelector("input")?.focus(); }
        } else setError(result.message);
      } catch { setError("Não foi possível salvar agora. Tente novamente."); }
    });
  }
  return <CatalogDialog title="Gerenciar categorias" onClose={close}>
    <form ref={inputRef} className="space-y-3" onSubmit={(event) => { event.preventDefault(); save(editing, { name, active: editing?.active ?? true }, true); }}>
      <div className="space-y-2"><Label htmlFor="category-name">{editing ? "Renomear categoria" : "Nova categoria"}</Label><Input id="category-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending}>{pending ? "Salvando…" : editing ? "Salvar nome" : "Adicionar categoria"}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setName(""); }}>Cancelar edição</Button>}</div>
    </form>
    {error && <p ref={errorRef} tabIndex={-1} role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-success">{message}</p>}
    <ul className="mt-5 divide-y border-t">{categories.map((category) => <li key={category.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{category.name}</p><Badge size="sm" variant={category.active ? "success" : "neutral"}>{category.active ? "Ativa" : "Inativa"}</Badge></div>
      <div className="flex flex-wrap gap-1"><Button variant="ghost" disabled={pending} aria-label={`Renomear ${category.name}`} onClick={() => { if (dirty && !window.confirm("Descartar as alterações não salvas?")) return; setEditing(category); setName(category.name); inputRef.current?.querySelector("input")?.focus(); }}>Renomear</Button><Button variant="outline" disabled={pending || editing?.id === category.id} aria-label={`${category.active ? "Inativar" : "Reativar"} ${category.name}`} onClick={() => save(category, { name: category.name, active: !category.active }, false)}>{category.active ? "Inativar" : "Reativar"}</Button></div>
    </li>)}</ul>
    {!categories.length && <EmptyState>Nenhuma categoria cadastrada.</EmptyState>}
    <p className="mt-4 text-xs text-muted">Inativar uma categoria preserva os produtos já associados.</p>
  </CatalogDialog>;
}

export function ProductCatalog({ products, categories: initialCategories, total, filters }: { products: Product[]; categories: ProductCategory[]; total: number; filters: CatalogFilters }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [editor, setEditor] = useState<Product | "new" | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  function navigate(next: CatalogFilters) {
    const params = new URLSearchParams({ search: next.search, category: next.category, status: next.status, page: String(next.page) });
    startTransition(() => router.push(`/admin/produtos?${params}`));
  }
  function saved(message: string) { setEditor(null); setFeedback({ ok: true, message }); router.refresh(); }
  return <>
    <PageHeader title="Produtos" description="Cadastre os itens vendidos pelo seu negócio." action={<Button onClick={() => setEditor("new")}><Plus className="h-4 w-4" />Novo produto</Button>} />
    <div className="mt-6 space-y-4">
      <form className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]" onSubmit={(event) => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        navigate({ search: String(data.get("search")), category: String(data.get("category")), status: String(data.get("status")) as CatalogFilters["status"], page: 1 });
      }}>
        <div className="min-w-0 space-y-2"><Label htmlFor="catalog-search">Buscar produto</Label><Input id="catalog-search" name="search" defaultValue={filters.search} maxLength={100} placeholder="Nome, SKU ou código de barras" /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="catalog-category">Categoria</Label><Select id="catalog-category" name="category" defaultValue={filters.category}><option value="">Todas</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{!category.active ? " (inativa)" : ""}</option>)}</Select></div>
        <div className="space-y-2"><Label htmlFor="catalog-status">Status</Label><Select id="catalog-status" name="status" defaultValue={filters.status}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></Select></div>
        <Button type="submit" variant="outline" disabled={pending}><Search className="h-4 w-4" />Buscar</Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted" role="status">{pending ? "Atualizando…" : `${total} ${total === 1 ? "produto" : "produtos"}`}</p><Button variant="ghost" onClick={() => setShowCategories(true)}>Gerenciar categorias</Button></div>
      {feedback && <p role={feedback.ok ? "status" : "alert"} className={`text-sm ${feedback.ok ? "text-success" : "text-danger"}`}>{feedback.message}</p>}
      {!products.length ? <EmptyState size="lg"><p className="font-semibold text-foreground">{filters.search || filters.category || filters.status !== "all" || filters.page > 1 ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}</p><p className="mt-2">{filters.search || filters.category || filters.status !== "all" || filters.page > 1 ? "Revise a busca ou os filtros para encontrar outros itens." : "Cadastre bebidas, alimentos e outros itens vendidos pelo seu negócio."}</p><Button className="mt-4" variant="outline" onClick={() => filters.search || filters.category || filters.status !== "all" || filters.page > 1 ? navigate({ search: "", category: "", status: "all", page: 1 }) : setEditor("new")}>{filters.search || filters.category || filters.status !== "all" || filters.page > 1 ? "Limpar filtros" : "Cadastrar primeiro produto"}</Button></EmptyState> :
        <Card><ul className="divide-y">{products.map((product) => <li key={product.id} className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 break-words text-sm font-semibold">{product.name}</h2><Badge variant={product.active ? "success" : "neutral"}>{product.active ? "Ativo" : "Inativo"}</Badge></div><p className="mt-1 break-words text-xs text-muted">{product.category_id ? categoryNames.get(product.category_id) ?? "Categoria indisponível" : "Sem categoria"}{product.sku ? ` · SKU ${product.sku}` : ""}</p><p className="mt-2 text-base font-semibold tabular-nums">{formatCatalogBRL(product.sale_price)} <span className="text-xs font-normal text-muted">/ {product.unit}</span></p></div>
          <div className="flex flex-wrap items-center gap-2"><Button variant="outline" aria-label={`Editar ${product.name}`} onClick={() => setEditor(product)}>Editar</Button><Button variant="ghost" disabled={pending} aria-label={`${product.active ? "Inativar" : "Reativar"} ${product.name}`} onClick={() => startTransition(async () => {
            try { const result = await setProductActive(product.id, !product.active); setFeedback(result); if (result.ok) router.refresh(); }
            catch { setFeedback({ ok: false, message: "Não foi possível atualizar. Tente novamente." }); }
          })}>{product.active ? "Inativar" : "Reativar"}</Button></div>
        </li>)}</ul></Card>}
      {(total > CATALOG_PAGE_SIZE || filters.page > 1) && <nav aria-label="Paginação dos produtos" className="flex items-center justify-between gap-2"><Button variant="outline" disabled={pending || filters.page <= 1} onClick={() => navigate({ ...filters, page: filters.page - 1 })}>Anterior</Button><span className="text-xs text-muted">Página {filters.page} de {Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE))}</span><Button variant="outline" disabled={pending || filters.page * CATALOG_PAGE_SIZE >= total} onClick={() => navigate({ ...filters, page: filters.page + 1 })}>Próxima</Button></nav>}
    </div>
    {editor && <ProductEditor product={editor === "new" ? null : editor} categories={categories} onClose={() => setEditor(null)} onSaved={saved} />}
    {showCategories && <CategoryManager categories={categories} onClose={() => setShowCategories(false)} onSaved={(category, message) => { setCategories((current) => [...current.filter((item) => item.id !== category.id), category].sort((a,b) => a.name.localeCompare(b.name))); setFeedback({ ok: true, message }); router.refresh(); }} />}
  </>;
}
