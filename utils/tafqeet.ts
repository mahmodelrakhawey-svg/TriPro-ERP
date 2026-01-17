/**
 * دالة تفقيط الأرقام (تحويل الأرقام إلى كلمات عربية)
 * تدعم الريال السعودي، الدولار، اليورو، والجنيه المصري
 */

const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const teens = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function convertGroup(n: number): string {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
        const rem = n % 10;
        return (rem > 0 ? ones[rem] + " و" : "") + tens[Math.floor(n / 10)];
    }
    if (n < 1000) {
        const rem = n % 100;
        return hundreds[Math.floor(n / 100)] + (rem > 0 ? " و" + convertGroup(rem) : "");
    }
    return "";
}

export function tafqeet(amount: number, currencyCode: string = 'EGP'): string {
    if (!amount && amount !== 0) return "";
    if (amount === 0) return "صفر";

    const parts = amount.toString().split('.');
    const integerPart = parseInt(parts[0], 10);
    const decimalPart = parts.length > 1 ? parseInt(parts[1].substring(0, 2).padEnd(2, '0'), 10) : 0;

    let text = "";

    if (integerPart > 0) {
        if (integerPart < 1000) {
            text += convertGroup(integerPart);
        } else if (integerPart < 1000000) {
            const thou = Math.floor(integerPart / 1000);
            const rem = integerPart % 1000;
            
            if (thou === 1) text += "ألف";
            else if (thou === 2) text += "ألفان";
            else if (thou >= 3 && thou <= 10) text += ones[thou] + " آلاف";
            else text += convertGroup(thou) + " ألف";

            if (rem > 0) text += " و" + convertGroup(rem);
        } else {
             const mill = Math.floor(integerPart / 1000000);
             const rem = integerPart % 1000000;
             
             if (mill === 1) text += "مليون";
             else if (mill === 2) text += "مليونان";
             else if (mill >= 3 && mill <= 10) text += ones[mill] + " ملايين";
             else text += convertGroup(mill) + " مليون";
             
             if (rem > 0) {
                 const thou = Math.floor(rem / 1000);
                 const rem2 = rem % 1000;
                 if (thou > 0) {
                     text += " و";
                     if (thou === 1) text += "ألف";
                     else if (thou === 2) text += "ألفان";
                     else if (thou >= 3 && thou <= 10) text += ones[thou] + " آلاف";
                     else text += convertGroup(thou) + " ألف";
                 }
                 if (rem2 > 0) text += " و" + convertGroup(rem2);
             }
        }
    }

    let currencyName = "جنيه";
    let subCurrencyName = "قرش";

    if (currencyCode === 'USD') { currencyName = "دولار"; subCurrencyName = "سنت"; }
    else if (currencyCode === 'EUR') { currencyName = "يورو"; subCurrencyName = "سنت"; }
    else if (currencyCode === 'SAR') { currencyName = "ريال"; subCurrencyName = "هللة"; }

    let result = text ? `${text} ${currencyName}` : "";

    if (decimalPart > 0) {
        result += (result ? " و" : "") + convertGroup(decimalPart) + " " + subCurrencyName;
    }

    return result + " فقط لا غير";
}
