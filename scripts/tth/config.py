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

# Book metadata lives in data/tth/books.json so another language can read it.
# BOOKS_INFO and DOCX_BOOKS keep the attribute names callers already use.
_BOOKS_PATH = Path(__file__).resolve().parents[2] / "data" / "tth" / "books.json"
with _BOOKS_PATH.open(encoding="utf-8") as _books_file:
    _BOOKS = json.load(_books_file)

BOOKS_INFO = _BOOKS["BOOKS_INFO"]
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
