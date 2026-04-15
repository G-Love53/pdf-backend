import { buildSalesLetterPrompts } from "./sharedSalesLetter.js";

export function build(extraction = {}, client = {}, letterContext = {}) {
  return buildSalesLetterPrompts("hvac", extraction, client, letterContext);
}
