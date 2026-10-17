// Singapore public holidays, so "Sundays vs weekdays" in the Trends section
// counts holidays with Sundays. Includes the Monday off when a holiday falls
// on a Sunday. Add each new year when MOM publishes it.
export const HOLIDAYS_SOURCE = 'https://www.mom.gov.sg/employment-practices/public-holidays';
export const HOLIDAYS_CHECKED = '17 Oct 2026';

export const SG_PUBLIC_HOLIDAYS: string[] = [
  // 2026
  '2026-01-01', // New Year's Day
  '2026-02-17', '2026-02-18', // Chinese New Year
  '2026-03-21', // Hari Raya Puasa
  '2026-04-03', // Good Friday
  '2026-05-01', // Labour Day
  '2026-05-27', // Hari Raya Haji
  '2026-05-31', '2026-06-01', // Vesak Day (Sunday) and the Monday off
  '2026-08-09', '2026-08-10', // National Day (Sunday) and the Monday off
  '2026-11-08', '2026-11-09', // Deepavali (Sunday) and the Monday off
  '2026-12-25', // Christmas Day
  // 2027
  '2027-01-01', // New Year's Day
  '2027-02-06', '2027-02-07', '2027-02-08', // Chinese New Year, and the Monday off
  '2027-03-10', // Hari Raya Puasa
  '2027-03-26', // Good Friday
  '2027-05-01', // Labour Day
  '2027-05-17', // Hari Raya Haji
  '2027-05-20', // Vesak Day
  '2027-08-09', // National Day
  '2027-10-28', // Deepavali
  '2027-12-25', // Christmas Day
];
