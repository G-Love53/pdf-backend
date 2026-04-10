import { buildSalesLetterPrompts } from "./sharedSalesLetter.js";

export function build(extraction = {}, client = {}) {
  return buildSalesLetterPrompts("roofer", extraction, client);
}
