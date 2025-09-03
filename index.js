function processFormData(formData) {
    console.log('=== START processFormData ===');
    console.log('Incoming formData keys:', Object.keys(formData));
    console.log('Sample values:', {
        applicant_name: formData.applicant_name,
        applicant_address: formData.applicant_address,
        applicant_email: formData.applicant_email
    });
    
    console.log('=== END processFormData - Returning UNMODIFIED data ===');
    return formData;
}