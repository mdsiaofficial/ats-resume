# ats-resume

[![npm version](https://img.shields.io/npm/v/ats-resume.svg)](https://www.npmjs.com/package/ats-resume)
[![downloads](https://img.shields.io/npm/dy/ats-resume.svg)](https://www.npmjs.com/package/ats-resume)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/mdsiaofficial/ats-resume/blob/main/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://ats-resume.vervel.app/how-to-contribute.html#your-first-pull-request)
![GitHub Repo stars](https://img.shields.io/github/stars/mdsiaofficial/ats-resume)

CLI tool to generate ATS-friendly PDF resumes from JSON/JSONC data

## Installation

```bash
npm install -g ats-resume
```

## Usage

```bash
ats-resume --json                 # Create demo-resume.jsonc template
ats-resume --create               # Generate PDF from the demo data file
ats-resume --create custom.jsonc  # Generate PDF from a custom data file
```

### Which data file is used

- With an explicit argument, that file is used. Relative paths are resolved
  against the current directory and absolute paths are accepted as given
  (e.g. `ats-resume --create /tmp/my-resume.jsonc`).
- Without an argument, `demo-resume.jsonc` is preferred. If only the legacy
  `demo-resume.json` exists, it is used instead and a note is printed.
- A `.json` file works exactly like a `.jsonc` file.

## Data file format

The resume data lives in a `.jsonc` file — JSON with comments. Both `.json` and
`.jsonc` files are accepted, and a plain `.json` file keeps working unchanged.

In a `.jsonc` file you may use:

- `//` line comments
- `/* ... */` block comments
- trailing commas before `}` or `]`

```jsonc
{
  // The name printed at the top of the resume
  "personalInfo": {
    "fullName": "Jane Doe",
    "nickname": "jane",
    "email": "jane@example.com",
    // Optional profile photo
    "image": "./photo.png",
    "imageShape": "square"
  },

  /* Work history. Set "show_resume": false to hide an entry from the PDF. */
  "experience": [
    {
      "title": "Software Engineer",
      "company": "Example Inc",
      "startDate": "Jan 2024",
      "current": true,
    },
  ],
}
```

Any entry with `"show_resume": false` is excluded from the generated PDF, and
sections you do not need can simply be deleted.

## Features

- Generate ATS-friendly PDF resumes from JSON/JSONC data
- Customizable templates with Handlebars
- Demo JSONC generation for quick start
- Support for custom JSON/JSONC input files
- Comments in the data file
- Optional profile photo in the top-right corner of the header
- Professional, clean output formatting

## Profile photo

Add an optional `image` field to `personalInfo` in your data file:

```jsonc
{
  "personalInfo": {
    "fullName": "Jane Doe",
    "nickname": "jane",
    "image": "./photo.png",
    "imageShape": "square"
  }
}
```

- Accepts a local path (relative to the data file, or absolute), an `https://` URL, or a `data:` URI.
- Supported formats: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`.
- The photo is rendered in the top-right corner, and the contact details wrap into two rows to fit.
- Local files are inlined into the PDF, so the resume can still be built from another working directory.
- Omit the field (or set it to `""`) for the original single-row header layout.

### Photo shape

`imageShape` controls how the photo is clipped:

| Value | Result |
| --- | --- |
| `square` | Hard-edged rectangle (96×96) |
| `rounded` | Rectangle with soft 8px corners |
| `circle` | Circular crop, slightly larger at 104×104 to read well |

- Optional. Omit it and the default `circle` is used; an unrecognised value also falls back to `circle` without warning.
- Common synonyms are accepted (`round`/`oval` → `circle`, `rect`/`rectangle` → `square`) and matching is case- and whitespace-insensitive.
- Only `circle` crops the image; `square` and `rounded` fill the full frame.

## License

MIT
