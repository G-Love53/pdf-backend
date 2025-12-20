// src/bind-processor.js
import { createClient } from '@supabase/supabase-js';

// Initialize the Brain (Service Role is REQUIRED to bypass RLS)
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function triggerCarrierBind({ quoteId }) {
    console.log(`🔥 BIND TRIGGERED for Quote ID: ${quoteId}`);
    
    // 1. RECALL THE MEMORY (Fetch from Supabase)
    const { data: quote, error } = await supabase
        .from('quote_opportunities')
        .select('*')
        .eq('id', quoteId)
        .single();

    if (error || !quote) {
        console.error(`❌ FATAL: Quote ID ${quoteId} not found in database.`);
        // TODO: Send "Error" email to admin
        return { success: false, error: "Quote not found" };
    }

    console.log(`✅ Memory Recalled: Binding ${quote.carrier_name} for ${quote.premium_amount}`);

    // 2. EXECUTE BINDING LOGIC
    // This is where you will eventually add:
    // - Stripe Payment Intent creation
    // - Famous.AI contract generation
    // - Carrier API submission
    
    // For now, we update the status so we know it's being worked on
    await supabase
        .from('quote_opportunities')
        .update({ status: 'binding_initiated' })
        .eq('id', quoteId);

    return { success: true, carrier: quote.carrier_name, premium: quote.premium_amount };
}
