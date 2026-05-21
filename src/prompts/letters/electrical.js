import { buildSalesLetterPrompts } from "./sharedSalesLetter.js";

export function build(extraction = {}, client = {}, letterContext = {}) {
  return buildSalesLetterPrompts("electrical", extraction, client, letterContext);
}
