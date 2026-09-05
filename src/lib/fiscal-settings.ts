export const BUSINESS_FISCAL_FIELDS = ["legal_name","trade_name","cnpj","state_registration","tax_regime","environment","address_street","address_number","address_complement","address_neighborhood","address_city","address_city_code","address_state","address_zip_code"] as const;
export const PRODUCT_FISCAL_FIELDS = ["ncm","cest","cfop","origin","icms_code_type","icms_code"] as const;
export type BusinessFiscalSettings = Record<typeof BUSINESS_FISCAL_FIELDS[number], string>;
export type ProductFiscalSettings = Record<typeof PRODUCT_FISCAL_FIELDS[number], string>;
export const FISCAL_FIELD_LABELS: Record<string,string> = {"legal_name":"Razão social","trade_name":"Nome fantasia","cnpj":"CNPJ","state_registration":"Inscrição estadual","tax_regime":"Regime tributário","environment":"Ambiente","address_street":"Logradouro","address_number":"Número","address_complement":"Complemento","address_neighborhood":"Bairro","address_city":"Cidade","address_city_code":"Código IBGE","address_state":"UF","address_zip_code":"CEP","ncm":"NCM","cest":"CEST","cfop":"CFOP","origin":"Origem","icms_code_type":"Tipo ICMS","icms_code":"Código ICMS"};
export const TAX_REGIMES = {"1":"Simples Nacional","2":"Simples Nacional — excesso de sublimite","3":"Regime Normal"};
// MOC 7.0 Anexo I / tabela de origem. See architecture-fiscal.md for official sources.
export const PRODUCT_ORIGINS = {
 "0":"Nacional, exceto códigos 3, 4, 5 e 8",
 "1":"Importação direta, exceto código 6",
 "2":"Estrangeira adquirida internamente, exceto código 7",
 "3":"Nacional: conteúdo importado acima de 40% e até 70%",
 "4":"Nacional: produção conforme processos produtivos básicos previstos na legislação",
 "5":"Nacional: conteúdo importado até 40%",
 "6":"Importação direta sem similar nacional (lista CAMEX) ou gás natural",
 "7":"Estrangeira adquirida internamente sem similar nacional (lista CAMEX) ou gás natural",
 "8":"Nacional: conteúdo importado acima de 70%"
};
export function parseFiscalSettings(kind: "business", input: unknown): BusinessFiscalSettings;
export function parseFiscalSettings(kind: "product", input: unknown): ProductFiscalSettings;
export function parseFiscalSettings(kind: "business" | "product", input: unknown) {
 if (!input || typeof input!=="object" || Array.isArray(input)) throw Error("Revise os dados fiscais.");
 const source=input as Record<string,unknown>, result:Record<string,string>={};
 const fields=kind==="business"?BUSINESS_FISCAL_FIELDS:PRODUCT_FISCAL_FIELDS;
 const lengths:Record<string,number>={cnpj:14,address_zip_code:8,address_city_code:7,ncm:8,cest:7,cfop:4};
 for(const field of fields) {
   const raw=source[field]??"";
   if(typeof raw!=="string") throw Error(`Revise ${FISCAL_FIELD_LABELS[field]}.`);
   let value=raw.trim();
   if(value.length>200) throw Error(`${FISCAL_FIELD_LABELS[field]}: use até 200 caracteres.`);
   if(lengths[field]&&value) {
     if(!/^[0-9 ./-]+$/.test(value)) throw Error(`${FISCAL_FIELD_LABELS[field]} deve conter ${lengths[field]} dígitos.`);
     value=value.replace(/[^0-9]/g,"");
     if(value.length!==lengths[field]) throw Error(`${FISCAL_FIELD_LABELS[field]} deve conter ${lengths[field]} dígitos.`);
   }
   if(field==="address_state"||field==="state_registration") value=value.toUpperCase();
   result[field]=value;
 }
 if(kind==="business") {
   result.environment ||= "homologation";
   if(result.address_state&&!/^[A-Z]{2}$/.test(result.address_state)) throw Error("UF deve conter 2 letras.");
   if(result.tax_regime&&!["1","2","3"].includes(result.tax_regime)) throw Error("Selecione um regime tributário válido.");
   if(!["homologation","production"].includes(result.environment)) throw Error("Selecione um ambiente válido.");
 } else {
   if(result.origin&&!/^[0-8]$/.test(result.origin)) throw Error("Selecione uma origem válida.");
   if(result.icms_code_type&&!["csosn","cst"].includes(result.icms_code_type)) throw Error("Selecione CST ou CSOSN.");
   if(result.icms_code&&!(result.icms_code_type==="csosn"?/^\d{3}$/:result.icms_code_type==="cst"?/^\d{2}$/:/a^/).test(result.icms_code)) throw Error("Informe 3 dígitos para CSOSN ou 2 para CST.");
 }
 return result;
}
export function fiscalSettingsReadiness(input: BusinessFiscalSettings) {
 try {input=parseFiscalSettings("business",input);} catch(error){return {ready:false,missing:[(error as Error).message]};}
 const missing=BUSINESS_FISCAL_FIELDS.filter(f=>!["trade_name","address_complement"].includes(f)&&!input[f]).map(f=>FISCAL_FIELD_LABELS[f]);
 return {ready:missing.length===0,missing};
}
export function getProductFiscalReadiness(input: ProductFiscalSettings, taxRegime: string) {
 try {input=parseFiscalSettings("product",input);} catch(error){return {ready:false,missing:[(error as Error).message]};}
 const missing=PRODUCT_FISCAL_FIELDS.filter(f=>f!=="cest"&&!input[f]).map(f=>FISCAL_FIELD_LABELS[f]);
 if(!taxRegime) missing.push("Regime tributário do negócio");
 else if(input.icms_code_type && input.icms_code_type!==(taxRegime==="1"?"csosn":"cst")) missing.push("Tipo ICMS compatível com o regime tributário");
 return {ready:missing.length===0,missing};
}
