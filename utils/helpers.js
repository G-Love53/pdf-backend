// utils/helpers.js
module.exports = {
  // Checkbox helper - returns 'X' or empty
  ck: (value) => {
    if (typeof value === 'boolean') return value ? 'X' : '';
    if (typeof value === 'string') return ['yes', 'y', 'true', '1'].includes(value.toLowerCase()) ? 'X' : '';
    return '';
  },
  
  // Yes/No helper
  yn: (value) => {
    if (typeof value === 'boolean') return value ? 'Y' : 'N';
    if (typeof value === 'string') return ['yes', 'y', 'true', '1'].includes(value.toLowerCase()) ? 'Y' : 'N';
    return 'N'; // Default to 'N' for risk questions
  },
  
  // Money formatting
  money: (value) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  },
  
  // Date formatting
  formatDate: (date = new Date()) => {
    const d = new Date(date);
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
  }
};
