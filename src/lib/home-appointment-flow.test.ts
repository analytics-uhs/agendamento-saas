import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectFixedMultipleSlot, fixedMultipleEndTime } from "./fixed-multiple-selection";
import { revalidateAdminTimeSelection } from "./admin-time-selection";
import { buildManualAppointmentInput } from "./appointments";

test("Home route and Agenda wire creation to the same AppointmentFormModal (not just editing)", () => {
  const home = readFileSync("src/app/admin/page.tsx", "utf8");
  const dashboard = readFileSync("src/components/admin/dashboard.tsx", "utf8");
  const operational = readFileSync("src/components/admin/agenda-page.tsx", "utf8");
  const daily = readFileSync("src/components/admin/daily-agenda-page.tsx", "utf8");
  assert.match(home, /<Dashboard/);
  assert.match(dashboard, /<AgendaPageContent/);
  const creation = operational.slice(operational.indexOf("{creating ? ("), operational.indexOf("{feedback ?"));
  assert.match(creation, /<AppointmentFormModal/);
  assert.match(creation, /prefill=\{\{ date: selectedDate \}\}/);
  assert.match(creation, /setAppointments\(next\)/);
  assert.match(daily, /<AppointmentFormModal/);
  assert.doesNotMatch(operational, /submitManualAppointment|fetchAvailability|initialForm|slots\.map/);
});

test("Home shared creation contract: three clicks yield one 18:00–21:00 input; :15 works", () => {
  for (const minutes of ["00", "15"]) {
    const slots = [18,19,20].map((hour,index)=>({startTime:`${hour}:${minutes}`,durationMinutes:60,maxBlocks:3-index}));
    let selection: {startTime:string|null;blocks:number}={startTime:null,blocks:1};
    for(const slot of slots) selection=selectFixedMultipleSlot(slots,selection.startTime,selection.blocks,slot.startTime);
    const payload=buildManualAppointmentInput({date:"2030-01-07",group1OptionId:"primary",group2OptionId:null,startTime:selection.startTime!,blocks:selection.blocks,customerName:"João",customerWhatsapp:"53999999999"});
    assert.equal(payload.blocks,3);
    assert.equal(Array.isArray(payload),false);
    assert.equal(fixedMultipleEndTime(payload.startTime,60,payload.blocks),`21:${minutes}`);
    // fixed/group_2 use the same single-slot branch of the shared revalidation.
    assert.equal(revalidateAdminTimeSelection(slots,payload.startTime,3,false).blocks,1);
  }
});
