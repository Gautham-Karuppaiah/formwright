// Option lists. Countries include look-alikes ("British Indian Ocean Territory", "Indonesia") on purpose:
// typing "India" into a search box matches more than one.
export const COUNTRIES = [
  ["Afghanistan", "+93"], ["Albania", "+355"], ["Algeria", "+213"], ["Argentina", "+54"], ["Australia", "+61"],
  ["Austria", "+43"], ["Bahrain", "+973"], ["Bangladesh", "+880"], ["Belgium", "+32"], ["Bhutan", "+975"],
  ["Brazil", "+55"], ["British Indian Ocean Territory", "+246"], ["Canada", "+1"], ["China", "+86"],
  ["Denmark", "+45"], ["Egypt", "+20"], ["Finland", "+358"], ["France", "+33"], ["Germany", "+49"],
  ["Hong Kong", "+852"], ["India", "+91"], ["Indonesia", "+62"], ["Ireland", "+353"], ["Israel", "+972"],
  ["Italy", "+39"], ["Japan", "+81"], ["Kenya", "+254"], ["Kuwait", "+965"], ["Malaysia", "+60"],
  ["Maldives", "+960"], ["Mexico", "+52"], ["Nepal", "+977"], ["Netherlands", "+31"], ["New Zealand", "+64"],
  ["Nigeria", "+234"], ["Norway", "+47"], ["Oman", "+968"], ["Pakistan", "+92"], ["Philippines", "+63"],
  ["Poland", "+48"], ["Portugal", "+351"], ["Qatar", "+974"], ["Saudi Arabia", "+966"], ["Singapore", "+65"],
  ["South Africa", "+27"], ["South Korea", "+82"], ["Spain", "+34"], ["Sri Lanka", "+94"], ["Sweden", "+46"],
  ["Switzerland", "+41"], ["Thailand", "+66"], ["Turkey", "+90"], ["United Arab Emirates", "+971"],
  ["United Kingdom", "+44"], ["United States", "+1"], ["Vietnam", "+84"],
];

export const STATES = {
  India: ["Andhra Pradesh", "Delhi", "Gujarat", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
    "Tamil Nadu", "Telangana", "Uttar Pradesh", "West Bengal"],
  "United Arab Emirates": ["Abu Dhabi", "Dubai", "Sharjah"],
  "United States": ["California", "New York", "Texas", "Washington"],
};

export const CITIES = {
  "Tamil Nadu": ["Chennai Free Trade Zone", "Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli", "Vellore"],
  Karnataka: ["Bengaluru", "Mangaluru", "Mysuru"],
  Maharashtra: ["Mumbai", "Nagpur", "Pune"],
  Telangana: ["Hyderabad", "Warangal"],
};

export const PINS = {
  Chennai: [["600001", "Chennai GPO"], ["600017", "T. Nagar"], ["600040", "Anna Nagar"], ["600096", "Perungudi"],
    ["600097", "Thoraipakkam"], ["600119", "Sholinganallur"], ["600130", "Navalur"]],
  Coimbatore: [["641001", "Coimbatore GPO"], ["641018", "R.S. Puram"]],
};

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];
export const YEARS = Array.from({ length: 14 }, (_, i) => String(2014 + i));

// A long language list like Oracle's: regional variants and look-alikes around each real answer.
export const LANGUAGES = ["Abkhazian", "Afrikaans", "Arabic", "Bengali", "Chinese", "Creoles and pidgins, English based",
  "Dutch", "English", "English (Australia)", "English (Canada)", "English (United Kingdom)", "English (United States)",
  "English, Middle", "English, Old", "French", "German", "Gujarati", "Hindi", "Hindustani", "Italian", "Japanese",
  "Japanese (Kansai)", "Kannada", "Korean", "Malayalam", "Marathi", "Portuguese", "Russian", "Spanish", "Tamil",
  "Telugu", "Urdu"];
export const PROFICIENCY = ["Elementary Proficiency", "Limited Working Proficiency", "Professional Working Proficiency",
  "Full Professional Proficiency", "Native or Bilingual Proficiency"];
