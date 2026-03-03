# AgroClima API Reference
## Every UI Screen → API Endpoint Mapping

Base URL: `http://localhost:5000/api/v1`

---

## 🔐 AUTH MODULE (Image 1 - Auth Screens)

### Screen: Sign In
```
POST /auth/signin
Body: { "email": "user@email.com", "password": "123456" }

✅ Success → { token, user: { id, name, email, role } }
❌ 401 → "Invalid email or password"
❌ 403 → "Email not verified" (auto-sends OTP)
```

### Screen: Sign Up
```
POST /auth/signup
Body: { "name": "Cole", "email": "cole@email.com", "password": "123456" }

✅ 201 → { userId, email } + OTP sent to email
❌ 400 → "Email already registered"
```

### Screen: Enter Your 6 Digit Code (after signup)
```
POST /auth/verify-otp
Body: { "email": "cole@email.com", "otp": "537XXX" }

✅ → { token, user } (logged in)
❌ 400 → "Invalid or expired OTP"
```

### "Haven't Received The OTP? Resend OTP" link
```
POST /auth/resend-otp
Body: { "email": "cole@email.com" }

✅ → "New verification code sent"
```

### Screen: Forgot Password
```
POST /auth/forgot-password
Body: { "email": "user@email.com" }

✅ → "Password reset code sent to your email"
```

### Screen: Enter Your 6 Digit Code (password reset)
```
POST /auth/verify-reset-otp
Body: { "email": "user@email.com", "otp": "537XXX" }

✅ → { resetToken }
```

### Screen: Create New Password
```
POST /auth/reset-password
Body: { "email": "user@email.com", "otp": "537XXX", "newPassword": "newpass123" }

✅ → "Password changed successfully"
```

---

## 🏠 HOME & SEARCH MODULE (Image 2 - Home Screens)

### Screen: Home (State/County dropdowns)
```
GET /stations/states
→ [{ code: "TX", name: "Texas" }, ...]

GET /stations/counties/TX
→ [{ fips: "48051", name: "Burleson", state: "TX" }, ...]
```

### Screen: Home → "Search" button click (Selected Flow: Lat/Lon Search)
The app uses a two-step flow when searching by Lat/Lon (Flow B).

**Step 1: Identify County & State from GPS (Reverse Geocode)**
```
POST /stations/reverse-geocode
Body: { "lat": 33.77261, "lon": -95.81259 }

→ {
    "countyFips": "48051",  // 👈 This is the FIPS code
    "countyName": "Burleson",
    "stateCode": "TX",
    "stateName": "Texas"
  }
```

**Step 2: Run the full determination for that site**
```
POST /evaluations/calculate
Headers: { Authorization: "Bearer <token>" }
Body: {
  "lat": 33.77261,
  "lon": -95.81259,
  "observationDate": "2025-06-04",
  "countyFips": "48051"        // optional but recommended, from Step 1
}

✅ → Full evaluation result (see Result Module below)
❌ 404 → "No AgACIS WETS station with sufficient data found"
```

### Screen: Result (map view with WET/DRY/NORMAL badge)
Response from `/evaluations/calculate`:
```json
{
  "success": true,
  "data": {
    "simpleLabel": "WET",
    "totalScore": 16,
    "maxScore": 18,
    "period": "March - April 2025",
    "station": {
      "name": "Altadena",
      "distance": 3.2
    },
    "climateReferencePeriod": "1971-2000"
  }
}
```

---

## 📍 STATION SELECTION MODULE (Image 2 - Station Screens)

### Screen: "No AgACIS WETS station... within 10 miles"
### → "View Nearby Stations" button
```
POST /stations/nearest
Body: { "lat": 33.77261, "lon": -95.81259, "radiusMiles": 10 }

→ {
    stations: [
      { name: "Los Angeles, Altadena", distance: 5.2, hasWetsData: true },
      { name: "New York, Avalon Catalina AP", distance: 12.1, hasWetsData: false }
    ],
    hasValidStation: true,
    searchRadius: 10
  }
```

### Screen: "View More Nearby Stations" (expands 10→20→30 miles)
```
POST /stations/search-more
Body: { "lat": 33.77261, "lon": -95.81259, "currentRadius": 20 }

→ Same format, expanded list, newRadius: 30
→ reachedLimit: true when hitting 100 miles
```

### Screen: Nearest Stations list (with station names + times)
```
Same /stations/nearest response, rendered as list:
- ACTON CALIFORNIA
- ALTADENA
- AVALON CATALINA AP
- BURBANK GLENDALE PASADENA AP
- CANYON COUNTRY
- CHATSWORTH 0.7 SE
```

---

## 📊 RESULT MODULE (Image 3 - Result Summary Screens)

### Screen: Result Summary (WET / DRY / NORMAL)
Full response from `/evaluations/calculate`:
```json
{
  "simpleLabel": "WET",
  "determination": "Wetter than Normal",
  "totalScore": 16,
  "maxScore": 18,
  "period": "March - April 2025",

  "rainfallRecord": [
    { "month": "March", "less30": 2.04, "avg": 4.48, "more30": 5.26, "rainfall": 5, "condition": "Normal" },
    { "month": "April", "less30": 0.39, "avg": 4.21, "more30": 5.22, "rainfall": 5, "condition": "Normal" },
    { "month": "May",   "less30": 0.10, "avg": 4.17, "more30": 4.73, "rainfall": 4, "condition": "Normal" }
  ],

  "additionalInfo": {
    "wetsStation": "Altadena",
    "location": "Los Angeles, Altadena",
    "soilMapUnit": "Kullit-Addielou complex, 1 to 3 percent slopes (KuB)",
    "growingSeason": "March 4 - November 26 (267 days)",
    "growingSeasonThreshold": "50% ≥ 28°F"
  },

  "climateReferencePeriod": "1971-2000"
}
```

### UI Mapping:
| UI Element | API Field |
|---|---|
| Green "WET" badge | `simpleLabel` |
| "Weighted Score (16 Out Of 18)" | `totalScore` / `maxScore` |
| "March - April 2025" | `period` |
| "Evaluated" tag | `status === "evaluated"` |
| Rainfall Record table | `rainfallRecord[]` |
| Rainfall colored circles (green/orange/blue) | `rainfallRecord[].condition` |
| Dry/Normal/Wet legend | derived from conditions |
| "WETS Station: Altadena" | `additionalInfo.wetsStation` |
| "Location: Los Angeles, Altadena" | `additionalInfo.location` |
| "Soil Map Unit: Kullit..." | `additionalInfo.soilMapUnit` |
| "Growing Season (50% ≥ 28°F)" | `additionalInfo.growingSeasonThreshold` |
| "March 4 - November 26 267 days" | `additionalInfo.growingSeason` |
| "Climate Reference Period: 1971-2000" | `climateReferencePeriod` |

### Screen: "Save" button
```
POST /evaluations/save
Headers: { Authorization: "Bearer <token>" }
Body: {
  "observationDate": "2025-06-04",
  "location": { "lat": 33.77261, "lon": -95.81259 },
  "county": "Los Angeles",
  "state": "CA",
  "countyFips": "06037",
  "station": { "name": "Altadena", "sid": "040232", "distance": 3.2 },
  "soilMapUnit": { "name": "Kullit-Addielou complex", "symbol": "KuB" },
  "growingSeason": { "startDate": "3/4", "endDate": "11/26", "totalDays": 267 },
  "monthDetails": [...],
  "totalScore": 16,
  "simpleLabel": "WET",
  "determination": "Wetter than Normal",
  "period": "March - April 2025"
}

✅ 201 → { id: "evaluation_id" }
```

### Screen: Saved (history list grouped by date)
```
GET /evaluations/saved
Headers: { Authorization: "Bearer <token>" }

→ {
    today: [
      { id, stationName: "Altadena", location: "Los Angeles, CA", time: "10:30 PM" }
    ],
    yesterday: [...],
    earlier: [...]
  }
```

---

## ⚙️ SETTINGS MODULE (Image 4 - Settings Screens)

### Screen: Settings (menu)
No API call needed — static navigation screen.

### Screen: Edit Profile
```
GET /users/profile
→ { name, email, avatar, role }

PUT /users/profile
Body: { "name": "Iris Rodriguez" }
→ "Profile updated successfully"

PUT /users/avatar
Body: { "avatar": "<file>" }
→ "Avatar updated successfully"
```

### Screen: Account Settings → Change Password
```
PUT /users/change-password
Body: { "currentPassword": "old123", "newPassword": "new456" }

✅ → "Password changed successfully"
❌ 400 → "Current password is incorrect"
```

### Screen: Contact & Support
```
POST /settings/contact
Body: { "name": "Cole", "email": "cole@email.com", "message": "Need help with..." }

✅ 201 → "Your message has been submitted successfully"
```

### Screen: Terms & Conditions
```
GET /settings/terms
→ { title, sections: [{ heading, content }], lastUpdated }
```

### Screen: Privacy & Policy
```
GET /settings/privacy
→ { title, sections: [{ heading, content }], lastUpdated }
```

---

## 📁 PROJECT STRUCTURE

```
src/
├── server.js                          # Express app entry
├── config/
│   ├── database.js                    # MongoDB connection
│   └── constants.js                   # NRCS fixed values
├── middleware/
│   ├── auth.js                        # JWT protect + adminOnly
│   ├── error.js                       # Error handler
│   └── rateLimiter.js                 # Rate limiting
├── modules/
│   ├── auth/
│   │   ├── auth.controller.js         # signup, signin, OTP, reset
│   │   └── auth.routes.js
│   ├── user/
│   │   ├── user.model.js              # User schema + OTP methods
│   │   ├── user.controller.js         # profile, change password
│   │   └── user.routes.js
│   ├── evaluation/
│   │   ├── evaluation.model.js        # Saved evaluation schema
│   │   ├── evaluation.controller.js   # calculate, save, list
│   │   └── evaluation.routes.js
│   ├── station/
│   │   ├── station.controller.js      # nearest, search, geocode
│   │   └── station.routes.js
│   └── settings/
│       ├── settings.controller.js     # contact, terms, privacy
│       └── settings.routes.js
└── utils/
    ├── acisService.js                 # ACIS API calls (stations + precip + WETS)
    ├── externalServices.js            # Soil API + Reverse geocoding
    ├── determination.js               # NRCS Procedure 2 calculator
    ├── geo.js                         # Haversine, bbox, UTM, prior months
    └── email.js                       # OTP email sender
```

---

## 🔗 COMPLETE ENDPOINT LIST

| Method | Endpoint | Auth | Screen |
|---|---|---|---|
| POST | `/auth/signup` | ❌ | Sign Up |
| POST | `/auth/signin` | ❌ | Sign In |
| POST | `/auth/verify-otp` | ❌ | OTP Verify |
| POST | `/auth/resend-otp` | ❌ | Resend OTP |
| POST | `/auth/forgot-password` | ❌ | Forgot Password |
| POST | `/auth/verify-reset-otp` | ❌ | Reset OTP |
| POST | `/auth/reset-password` | ❌ | Create New Password |
| GET | `/users/profile` | ✅ | Edit Profile |
| PUT | `/users/profile` | ✅ | Edit Profile |
| PUT | `/users/change-password` | ✅ | Change Password |
| GET | `/stations/states` | ❌ | Home (dropdown) |
| GET | `/stations/counties/:state` | ❌ | Home (dropdown) |
| POST | `/stations/nearest` | ✅ | Nearest Stations |
| POST | `/stations/search-more` | ✅ | View More Stations |
| POST | `/stations/by-county` | ✅ | Home Search |
| POST | `/stations/reverse-geocode` | ✅ | Quick Search |
| POST | `/evaluations/calculate` | ✅ | Result (main) |
| POST | `/evaluations/save` | ✅ | Save button |
| GET | `/evaluations/saved` | ✅ | Saved list |
| GET | `/evaluations/:id` | ✅ | Saved detail |
| DELETE | `/evaluations/:id` | ✅ | Delete saved |
| GET | `/evaluations/admin/all` | 🔒 Admin | Admin dashboard |
| POST | `/settings/contact` | ✅ | Contact & Support |
| GET | `/settings/terms` | ❌ | Terms & Conditions |
| GET | `/settings/privacy` | ❌ | Privacy & Policy |
