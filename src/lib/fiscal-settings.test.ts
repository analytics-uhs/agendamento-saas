import assert from "node:assert/strict";
import test from "node:test";
import {parseFiscalSettings,fiscalSettingsReadiness,getProductFiscalReadiness} from "./fiscal-settings";
test("business fiscal normalizes and readiness is cadastral only",()=>{
 const empty=parseFiscalSettings("business",{});
 assert.equal(empty.environment,"homologation");
 assert.equal(fiscalSettingsReadiness(empty).ready,false);
 const full=parseFiscalSettings("business",{legal_name:" Teste ",cnpj:"12.345.678/0001-90",state_registration:" isento ",tax_regime:"1",address_street:"Rua",address_number:"10",address_neighborhood:"Centro",address_city:"São Paulo",address_city_code:"3550308",address_state:"sp",address_zip_code:"01001-000"});
 assert.equal(full.cnpj,"12345678000190");assert.equal(full.address_state,"SP");assert.equal(full.state_registration,"ISENTO");
 assert.equal(fiscalSettingsReadiness(full).ready,true);
 for(const patch of [{cnpj:"123"},{address_zip_code:"123"},{address_state:"SSS"},{tax_regime:"4"},{environment:"live"}])assert.throws(()=>parseFiscalSettings("business",patch));
 assert.equal(parseFiscalSettings("business",{environment:"production"}).environment,"production");
});
test("product fiscal formats, optional data and CRT compatibility",()=>{
 const empty=parseFiscalSettings("product",{});assert.equal(getProductFiscalReadiness(empty,"1").ready,false);
 const product=parseFiscalSettings("product",{ncm:"12.34.56.78",cfop:"5.102",origin:"0",icms_code_type:"csosn",icms_code:"102",cest:"",fiscal_unit:"UN",fiscal_gtin:"SEM GTIN",pis_code:"07",cofins_code:"07"});
 assert.equal(product.ncm,"12345678");assert.equal(product.cfop,"5102");
 assert.equal(getProductFiscalReadiness(product,"1").ready,true);
 assert.equal(getProductFiscalReadiness(product,"2").ready,false);
 assert.equal(getProductFiscalReadiness({...product,icms_code_type:"cst",icms_code:"00"},"2").ready,true);
 assert.equal(getProductFiscalReadiness({...product,icms_code_type:"cst",icms_code:"00"},"3").ready,true);
 for(const patch of [{ncm:"1"},{cest:"123"},{cfop:"123"},{origin:"9"},{icms_code_type:"other"},{icms_code:"102"},{icms_code_type:"cst",icms_code:"102"}])assert.throws(()=>parseFiscalSettings("product",patch));
 assert.equal(getProductFiscalReadiness({...product,ncm:"1"},"1").ready,false);
 assert.ok(!("business_id" in parseFiscalSettings("product",{business_id:"forged"})));
});
