# Hebrew Transliteration System - v2.0

**Building Academic Bridges for Hebrew and Aramaic Transliteration**

Integrated transliteration system for Davar that generates multilingual datasets of Hebrew transliterations and pronunciation guides based on SBL and Brill standards. Uses established scholarly transliteration systems to ensure accuracy and consistency across languages.

## Overview

This system provides a comprehensive academic framework for Hebrew and Aramaic transliteration based on established scholarly standards. It uses two major transliteration systems:

### 🎓 **Academic Standards**
- **SBL General Purpose**: Simplified academic standard (Society of Biblical Literature)
- **Brill Simplified**: Advanced academic standard with additional distinctions

### 🏗️ **Architecture**
- **Universal Base Schema**: `SCHEMA.jsonc` - Template adaptable to any language
- **Language-Specific Schemas**: Generated schemas in `schemas/{lang}.jsonc`
- **LLM Generation**: Deterministic instructions for consistent quality
- **Validation Pipeline**: Automated checking against academic standards

### 🌍 **Multilingual Support**
- 10+ supported languages with native phonetic adaptations
- Consistent academic quality across all language variants
- Strong's concordance integration for enhanced accuracy

## Quick Start

### 1. **Navigate to Transliteration Tools**
   ```bash
   # This is part of the Davar project
   cd davar/tools/bani
   ```

### 2. **Review the Architecture**
   - `SCHEMA.jsonc` - Universal base schema (adaptable to any language)
   - `INSTRUCTIONS.md` - Detailed v2.0 instructions for LLM generation
   - `research/` - SBL/Brill reference implementations
   - `schemas/` - Language-specific generated schemas
   - `.cursorrules` - Project guidelines and academic standards

### 3. **Choose Your Transliteration System**
   - **SBL General Purpose**: User-friendly, educational contexts
   - **Brill Simplified**: Academic, scholarly publications

### 4. **Generate a Language-Specific Schema**
   ```bash
   # Copy the universal base
   cp SCHEMA.jsonc schemas/{language-code}.jsonc

   # Example for Spanish
   cp SCHEMA.jsonc schemas/es.jsonc
   ```

### 5. **Use LLM to Adapt**
   - Open `INSTRUCTIONS.md` (v2.0) as your prompt
   - Replace `{LANGUAGE_*}` placeholders with your target language
   - Choose appropriate transliteration system
   - Generate native names and phonetic adaptations

### 6. **Validate and Contribute**
   - Run validation checks against academic standards
   - Test with Hebrew words containing dagesh and complex vowels
   - Submit via pull request for community review

## Project Structure

```
davar/tools/bani/
├── data/                 # Strong's concordance datasets
│   ├── strongs.json      # Complete Strong's Hebrew dictionary
│   └── strong_es.json    # Spanish translations + Strong's data
├── research/             # Academic reference implementations
│   ├── README.md         # Credits and usage notes
│   └── hebrew-transliteration/  # SBL/Brill library source
├── schemas/              # Language-specific transliteration schemas
│   ├── SCHEMA.jsonc      # Universal base schema (v2.0)
│   ├── es.json           # Spanish schema (SBL General Purpose)
│   └── {lang}.json       # Other language schemas
├── scripts/              # Processing scripts
│   └── es.py             # Spanish transliteration generator (v2.0)
├── SCHEMA.jsonc         # Legacy schema template (v1.x)
├── INSTRUCTIONS.md      # LLM generation instructions (v2.0)
├── PRD.md               # Product Requirements Document
├── .cursorrules         # Project guidelines & academic standards
└── README.md            # This file (v2.0)
```

## Creating a New Schema (v2.0)

### 🎯 **Step 1: Choose Your Language & System**

#### Supported Languages (ISO-639-1):
- `es` - Spanish (SBL General Purpose recommended)
- `en` - English (Brill Simplified recommended)
- `pt` - Portuguese (SBL General Purpose)
- `fr` - French (Brill Simplified)
- `de` - German (Brill Simplified)
- `it` - Italian (SBL General Purpose)
- `ru` - Russian
- `ar` - Arabic
- `zh` - Chinese
- `he` - Hebrew (native)

#### Choose Transliteration System:
- **SBL General Purpose**: For educational, user-friendly contexts
- **Brill Simplified**: For academic, scholarly publications

### 🏗️ **Step 2: Create from Universal Base**

```bash
# Copy the universal base schema
cp SCHEMA.jsonc schemas/{language-code}.jsonc

# Example for Spanish
cp SCHEMA.jsonc schemas/es.jsonc
```

### 🤖 **Step 3: Use LLM with Enhanced Instructions**

1. **Open `INSTRUCTIONS.md` (v2.0)** - Contains academic standards
2. **Copy as prompt** - Includes SBL/Brill system selection
3. **Replace placeholders**:
   ```json
{
  "language": {
       "code": "es",
       "name": "Spanish",
    "variant": "neutral"
     },
     "style": {
       "system": "sbl_general_purpose"  // Choose your system
     }
   }
   ```
4. **LLM fills academic content**:
   - Native language name and description
   - Phonetic mappings adapted to target language
   - 24 examples with academic transliterations
   - System-specific configurations

### ✅ **Step 4: Validate Against Academic Standards**

#### v2.0 Validation Requirements:
- ✅ **System selection**: `"sbl_general_purpose"` or `"brill_simplified"`
- ✅ **All 27 consonants**: Base mappings using spirantized forms (v, kh, f)
- ✅ **All 9 vowels**: Standard + system-specific variants
- ✅ **24 examples**: Academic transliterations with proper dagesh handling
- ✅ **JSON/JSONC syntax**: Valid and properly formatted
- ✅ **System consistency**: Sheva, ayin, het match chosen system

#### Academic Quality Checks:
- 🧪 **Dagesh accuracy**: Base forms become plosives with dagesh
- 🧪 **Syllable integrity**: Digraphs (sh, ts, kh) stay together
- 🧪 **Strong's alignment**: Pron/xlit fields properly utilized
- 🧪 **Native fluency**: Target language speakers validate pronunciation

## Schema Requirements (v2.0)

### 🏛️ **Academic Foundation**
- **Based on**: SBL General Purpose and Brill Simplified standards
- **Dagesh handling**: Automatic spirantization/plosivization
- **System choice**: SBL (user-friendly) or Brill (academic)

### 📋 **Required Fields v2.0**

#### Core Structure:
1. **Language**: Code, name, variant
2. **Style**: System selection, academic naming, configuration flags
3. **Rules**: Consonants (27), vowels (9), composites, post-processing
4. **Examples**: 24 academic examples (H1-H24) with transliterations
5. **Workflow**: Strong's integration configuration
6. **Validation**: Academic compliance metadata

#### System-Specific Configurations:

**SBL General Purpose:**
```json
{
  "style": {
    "system": "sbl_general_purpose",
    "qamatz_qatan": false,
    "sheva": "e"
  },
  "rules": {
    "consonants": {
      "ח": "kh", "ע": "", "צ": "ts"  // Simple characters
    }
  }
}
```

**Brill Simplified:**
```json
{
  "style": {
    "system": "brill_simplified",
    "qamatz_qatan": true,
    "sheva": "ᵉ"
  },
  "rules": {
    "consonants": {
      "ח": "ḥ", "ע": "'", "צ": "tz"  // Special characters
    }
  }
}
```

### 🎯 **Language-Specific Academic Adaptations**

| Language | System | Key Features |
|----------|--------|--------------|
| **Spanish** | SBL General Purpose | ח→"j", ע→"", צ→"ts", ש→"sh" |
| **English** | Brill Simplified | ḥ→"ḥ", ע→"'", צ→"tz", ש→"sh" |
| **Portuguese** | SBL General Purpose | ח→"j", ש→"x", צ→"ts" |
| **French** | Brill Simplified | ḥ→"ḥ", ע→"'", advanced ligatures |
| **German** | Brill Simplified | ḥ→"ḥ", ע→"'", qamats qatan distinction |

See `INSTRUCTIONS.md` for complete academic mappings and system guidelines.

## Automated Schema Generation (v2.0)

### Spanish Schema Generator: `scripts/es.py`

The project includes an automated script for generating Spanish transliteration schemas using the SBL General Purpose system:

```bash
# Generate only the Spanish schema
python scripts/es.py --generate-schema-only

# Generate schema and process first 100 transliterations
python scripts/es.py --limit 100

# Generate complete dataset (all 8,674 entries)
python scripts/es.py
```

#### Features:
- **Automatic Schema Generation**: Creates Spanish schema from `SCHEMA.jsonc`
- **SBL General Purpose System**: Implements academic standards for Spanish phonetics
- **Batch Processing**: Efficiently processes thousands of Strong's entries
- **Validation**: Built-in academic compliance checking
- **Extensible**: Can be adapted for other languages following the same pattern

#### Output:
- `schemas/es.json` - Complete Spanish transliteration schema
- `data/strong_es.json` - All 8,674 transliterated entries with pronunciation guides

### For Other Languages

To create generators for other languages:

1. Copy `scripts/es.py` to `scripts/{lang}.py`
2. Update `generate_{lang}_schema()` function with language-specific mappings
3. Choose appropriate transliteration system (SBL or Brill)
4. Test with sample data before full processing

## Contributing (v2.0)

### 📝 **Academic Contribution Process**

1. **Choose your language and system**
   - Select target language (ISO-639-1 code)
   - Choose appropriate transliteration system (SBL/Brill)

2. **Generate academic schema**
   ```bash
   cp SCHEMA.jsonc schemas/{lang}.jsonc
   # Use INSTRUCTIONS.md v2.0 as LLM prompt
   # Ensure academic compliance
   ```

3. **Validate against standards**
   - ✅ System-specific configurations match chosen standard
   - ✅ Dagesh base mappings use spirantized forms
   - ✅ Academic transliterations follow SBL/Brill conventions
   - ✅ Native language validation by speakers

4. **Submit scholarly contribution**
   - Schema file in `schemas/{lang}.jsonc`
   - Academic documentation of phonetic choices
   - Test results with complex Hebrew words
   - Pull request with detailed description

### 🎓 **Quality Assurance**

#### Academic Review Criteria:
- **Linguistic accuracy**: Native speakers validate pronunciation
- **System compliance**: Strict adherence to SBL or Brill standards
- **Dagesh precision**: Correct spirantization/plosivization
- **Syllable integrity**: Digraphs protected during splitting
- **Strong's alignment**: Enhanced accuracy through concordance data

#### Validation Tools:
- Automated schema validation scripts
- Cross-reference with existing academic transliterations
- Native speaker pronunciation testing
- Academic peer review process

## Data & Research

### 📚 **Strong's Concordance Datasets**
- **`data/strongs.json`**: Complete Hebrew Strong's dictionary (8,674 entries, H1-H8674)
- **`data/strong_es.json`**: Spanish translations with Strong's data
- **Essential Fields**: `id`, `hebrew`, `pron`, `xlit`, `language`

### 🔬 **Academic Research Resources**
- **`research/hebrew-transliteration/`**: SBL and Brill library source code
- **Reference implementations**: Working examples of both systems
- **Comparative analysis**: Differences between SBL and Brill approaches

### 📊 **Dataset Applications**
- Generate complete Biblical Hebrew transliteration databases (8,674 entries)
- Create pronunciation guides using `pron` field for phonetic transcription
- Validate transliteration schemas against academic `xlit` references
- Support Strong's number integration in Bible study applications
- Schema testing with comprehensive Biblical Hebrew vocabulary
- Development of multilingual Hebrew learning tools

## License & Academic Standards

- **Code**: MIT License
- **Data**: CC-BY-SA 4.0 (Strong's concordance)
- **Academic Standards**: Based on SBL Handbook of Style and Brill Encyclopedia

## 📖 **Resources (v2.0)**

### Core Documentation:
- **Universal Base Schema**: `SCHEMA.jsonc` - Adaptable template
- **Academic Instructions**: `INSTRUCTIONS.md` v2.0 - LLM generation guide
- **Research Reference**: `research/` - SBL/Brill implementations
- **Project Standards**: `.cursorrules` - Academic guidelines

### Advanced Resources:
- **Product Vision**: `PRD.md` - Project requirements
- **Legacy Template**: `SCHEMA.jsonc` - v1.x compatibility
- **Example Schemas**: `schemas/es.json` - Spanish SBL implementation
- **Processing Scripts**: `scripts/es.py` - Automated schema generation (v2.0)

### Academic References:
- Society of Biblical Literature (SBL) Handbook of Style
- Brill Encyclopedia of Hebrew Language and Linguistics
- Strong's Exhaustive Concordance data
- Unicode Hebrew character standards

---

*Building academic bridges through scholarly transliteration, enabling all nations to engage the Hebrew Scriptures with precision and reverence.*
