# ats-resume

[![npm version](https://img.shields.io/npm/v/ats-resume.svg)](https://www.npmjs.com/package/ats-resume)
[![downloads](https://img.shields.io/npm/dy/ats-resume.svg)](https://www.npmjs.com/package/ats-resume)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/mdsiaofficial/ats-resume/blob/main/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://ats-resume.vervel.app/how-to-contribute.html#your-first-pull-request)
![GitHub Repo stars](https://img.shields.io/github/stars/mdsiaofficial/ats-resume)

CLI tool to generate ATS-friendly PDF resumes from JSON

## Installation

```bash
npm install -g ats-resume
```

## Usage

```bash
ats-resume --json        # Create demo JSON
ats-resume --create      # Generate PDF from demo JSON
ats-resume --create custom.json  # Generate PDF from custom JSON file
```

## Features

- Generate ATS-friendly PDF resumes from JSON data
- Customizable templates with Handlebars
- Demo JSON generation for quick start
- Support for custom JSON input files
- Optional profile photo in the top-right corner of the header
- Professional, clean output formatting

## Profile photo

Add an optional `image` field to `personalInfo` in your JSON:

```json
{
  "personalInfo": {
    "fullName": "Jane Doe",
    "nickname": "jane",
    "image": "./photo.png",
    "imageShape": "square"
  }
}
```

- Accepts a local path (relative to the JSON file, or absolute), an `https://` URL, or a `data:` URI.
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
