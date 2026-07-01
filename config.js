// ============================================================
// PWAC PEOPLE DATABASE — CONFIGURATION
// ============================================================
// This is the ONE file you may occasionally need to edit directly.
// Everything else (people, photos, tags) is managed in the Google Sheet.
//
// WHAT'S IN HERE:
//  - Google API key (read-only access to your Sheet + Photos folder)
//  - The Sheet ID and Photos folder ID
//  - The two access passcodes (Admin / User)
//
// TO CHANGE THE PASSCODES: edit the two lines below (ADMIN_CODE, USER_CODE),
// save this file, and push the change to GitHub. Everyone with the old
// code will be locked out; share the new code with whoever should have it.
// ============================================================

const CONFIG = {
  // Google API key — restricted to Drive API + Sheets API, read-only
  API_KEY: "AIzaSyA8r60eaP6ojWmR400ckcKuyDkluRkbw-4",

  // The PWAC People Database Google Sheet ID (from its URL)
  SHEET_ID: "1i5NnsoEY1dWYhbrSbduLOsSkP5pxw8uZAVLAlAXoDC8",

  // The exact name of the data tab within the sheet
  SHEET_TAB: "People Database",

  // The Google Drive folder ID holding all photos
  PHOTOS_FOLDER_ID: "1D4YfKbwq2pYf_pbCfXQt36C1EIYjEXWs",

  // Access passcodes — change these any time by editing this file
  ADMIN_CODE: "pwac-admin-2026",
  USER_CODE: "pwac-team-2026",

  // App display name
  APP_NAME: "PWAC People"
};
