import "server-only";
import { AsyncLocalStorage } from "async_hooks";

const clinicContext = new AsyncLocalStorage<number>();
export const runWithWhatsAppClinic = <T>(clinicId: number, work: () => Promise<T>) => clinicContext.run(clinicId, work);
export const currentWhatsAppClinicId = () => clinicContext.getStore();
