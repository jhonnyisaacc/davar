#!/usr/bin/env python3
"""
TTH2 Configuration Module
=========================

Configuration constants for TTH2 processing.

Book metadata and the DOCX-to-books map are loaded from data/tth/books.json.
Hebrew terms stay here as a glossary for the converter.

Author: Davar Project
"""

import json
from pathlib import Path

from scripts.books import book_by_tth_code

# Pipeline fields live in data/tth/books.json. Names and codes load from
# data/knowledge/registries/books.json and must match the copies in this file.
# BOOKS_INFO and DOCX_BOOKS keep the attribute names callers already use.
_BOOKS_PATH = Path(__file__).resolve().parents[2] / "data" / "tth" / "books.json"
_NAME_FIELDS = ("tth_name", "hebrew_name", "english_name", "spanish_name", "book_code")
with _BOOKS_PATH.open(encoding="utf-8") as _books_file:
    _BOOKS = json.load(_books_file)


def _books_info(file_books: dict) -> dict:
    composed = {}
    for code, info in file_books.items():
        record = book_by_tth_code(code)
        names = record["tth"]
        for field in _NAME_FIELDS:
            registry_value = names[field]
            file_value = info.get(field)
            if file_value != registry_value:
                raise ValueError(
                    f"{code}.{field} in data/tth/books.json is {file_value!r}; "
                    f"registry has {registry_value!r}"
                )
        if info.get("section") != record["section"]:
            raise ValueError(
                f"{code}.section in data/tth/books.json is {info.get('section')!r}; "
                f"registry has {record['section']!r}"
            )
        entry = dict(info)
        entry["tth_name"] = names["tth_name"]
        entry["hebrew_name"] = names["hebrew_name"]
        entry["english_name"] = names["english_name"]
        entry["spanish_name"] = names["spanish_name"]
        entry["book_code"] = names["book_code"]
        composed[code] = entry
    return composed


BOOKS_INFO = _books_info(_BOOKS["BOOKS_INFO"])
DOCX_BOOKS = _BOOKS["DOCX_BOOKS"]

# Hebrew terms dictionary
HEBREW_TERMS = {
    'יהוה': 'Tetragrámaton - Nombre de Elohim',
    'Yeshúa': 'Jesús en hebreo',
    'Mesías': 'El Ungido, Cristo',
    'Elohim': 'Dios, Poderoso',
    'Eloah': 'Singular de Elohim',
    'Elohah': 'Singular de Elohim',
    'EL': 'Versión corta de Elohim',
    'Adón': 'Señor, Amo',
    'Adonai': 'Señor, Amo',
    'Rúaj': 'Espíritu, viento, aliento',
    'Ha\'Kódesh': 'Santo',
    'Rúaj Ha\'Kódesh': 'Espíritu de Santidad',
    'emunah': 'fe, fidelidad, constancia',
    'shalom': 'paz, bienestar completo',
    'Ha\'Satán': 'El adversario',
    'Ha\'satán': 'El adversario',
    'Kadosh': 'Apartado, Santo',
    'Teshuváh': 'Retorno, arrepentimiento',
    'Malajim': 'Mensajeros, ángeles',
    'malaj': 'mensajero, ángel',
    'Tzebaot': 'Ejércitos',
    'Hejal': 'Santuario, Templo',
    'Ierushaláim': 'Jerusalén',
    'Ierushalem': 'Jerusalén',
    'Iehudáh': 'Judá',
    'Iehudí': 'Judío',
    'Iehudim': 'Judíos',
    'iehudim': 'Judíos',
    'Mitzráim': 'Egipto',
    'mitzrim': 'Egipcios',
    'mitzrit': 'Egipcia',
    'Shofar': 'Cuerno de carnero',
    'shofarot': 'Cuernos de carnero (plural)',
    'Gei Hinom': 'Valle de Hinom, Gehena',
    'Guei Hinom': 'Valle de Hinom, Gehena',
    'Iojanán': 'Juan',
    'Iaacob': 'Santiago, Jacobo',
    'Moshéh': 'Moisés',
    'Rajab': 'Rahab',
    'Rujot': 'Espíritus, Vientos (plural)',
    'Galil': 'Galilea',
    'Iardén': 'Jordán',
    'Bet Léjem': 'Belén',
    'Natzrat': 'Nazaret',
    'Notzrí': 'Nazareno',
    'Pésaj': 'Pascua',
    'tefilah': 'oración',
    'Ben Ha\'Adam': 'Hijo del Hombre',
    'av': 'Padre',
    'olam': 'mundo, era, tiempo',
    'man': 'Maná',
    'Rabí': 'Rabino, Maestro',
    'perushim': 'Fariseos',
    'tzadikim': 'Saduceos',
    'shomroní': 'Samaritano',
    'guelilí': 'Galileo',
    'Ieshaiáhu': 'Isaías',
    'Irmiáh': 'Jeremías',
    'Ionah': 'Jonás',
    'Eliyáhu': 'Elías',
    'Shelomóh': 'Salomón',
    'Migdalit': 'Magdalena',
    'kirení': 'Cireneo',
    'Gólgota': 'Gólgota',
    'Gulgolet': 'Calavera',
    'goral': 'suerte, suertes',
    'Matzot': 'Pan sin levadura',
    'Ish-Kariot': 'Iscariote',
    'Bet Aniah': 'Betania',
    'Eleazar': 'Lázaro',
    'Martah': 'Marta',
    'Miriam': 'María',
    'Filipos': 'Felipe',
    'Andreas': 'Andrés',
    'Shimón': 'Simón',
    'Kefa': 'Pedro',
    'Tomáh': 'Tomás',
    'Zekariáhu': 'Zacarías',
    'Adam': 'Hombre, ser humano',
    'Adamáh': 'Tierra, suelo',
    'Néfesh': 'Alma, persona, garganta',
    'Neshamáh': 'Aliento de vida',
    'jai': 'Vida',
    'najash': 'Serpiente',
    'Ishmael': 'El escucha',
    'Itzjak': 'Reirá',
    'Ribkah': 'Unida',
    'Esav': 'Peludo',
    'Iosef': 'Él añadirá',
    'Káin': 'Adquirido',
    'Hével': 'Vapor',
    'Nóaj': 'El que porta descanso',
    'Shem': 'Nombre',
    'Jam': 'Caliente',
    'Iáfet': 'Ampliar',
    'Kenáan': 'Canaán',
    'Beersheva': 'Pozo del juramento',
    'Shabat': 'Descanso, sábado',
    'Torah': 'Instrucción, ley',
    'Mishkán': 'Tabernáculo',
    'leviím': 'Levitas',
    'Mishpat': 'Juicio, proceso legal',
    'Tzedakáh': 'Justicia',
    'Jésed': 'Bondad, misericordia',
    'ketuvim': 'Escrituras',
    'kedoshim': 'Santos, apartados',
}
