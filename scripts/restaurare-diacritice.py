"""Restaurare diacritice pentru textele galeriilor (decoratiuni-data.js).

Toate cele 129 de texte sunt scrise complet fara diacritice (au fost generate
dintr-un Excel). Dictionarul de mai jos acopera vocabularul REAL al fisierului.

Cuvintele unde forma fara diacritice e si ea corecta (forma articulata: „masa"
= the table, „nunta" = the wedding) sunt tratate prin reguli de context, nu
prin substitutie oarba — vezi CONTEXT.
"""
import re

FIX = {
    # funcționale (cele mai frecvente)
    "si": "și", "in": "în", "intr": "într", "sa": "să",
    # substantive / adjective
    "rosii": "roșii", "rosu": "roșu", "rosie": "roșie", "visinii": "vișinii",
    "lumanari": "lumânări", "lumanare": "lumânare", "lumanarile": "lumânările",
    "nuante": "nuanțe", "alba": "albă", "invitati": "invitați",
    "invitatilor": "invitaților", "ursulet": "ursuleț", "ursuleti": "ursuleți",
    "stelute": "steluțe", "bebelus": "bebeluș", "bebelusului": "bebelușului",
    "norisori": "norișori", "leagan": "leagăn", "carucior": "cărucior",
    "fetita": "fetiță", "baietel": "băiețel", "baiat": "băiat",
    "colt": "colț", "numar": "număr", "piersica": "piersică", "carti": "cărți",
    "gradina": "grădină", "tinute": "ținute", "prajituri": "prăjituri",
    "cristelnita": "cristelniță", "coloana": "coloană",  # „Regina de pica" e numele cartii de joc — ramane articulat
    "verdeata": "verdeață", "marturii": "mărturii", "salii": "sălii",
    "panglica": "panglică", "pereti": "pereți", "portii": "porții",
    "crengute": "crenguțe", "stegulete": "stegulețe", "betisoare": "bețișoare",
    "cosuri": "coșuri", "maini": "mâini", "varf": "vârf", "cuvantul": "cuvântul",
    "initialele": "inițialele", "locatie": "locație", "emotie": "emoție",
    "experienta": "experiență", "dezvaluire": "dezvăluire",
    "dezvaluirii": "dezvăluirii", "preferintelor": "preferințelor",
    "carticelele": "cărticelele", "conferinte": "conferințe", "lansari": "lansări",
    "subtiri": "subțiri", "sarbatoritului": "sărbătoritului",
    "inscriptia": "inscripția", "decoratiune": "decorațiune",
    "iasi": "Iași", "craciun": "Crăciun",
    # adjective / participii feminine
    "decorata": "decorată", "drapata": "drapată", "festiva": "festivă",
    "impodobita": "împodobită", "impodobite": "împodobite",
    "amplasata": "amplasată", "aranjata": "aranjată", "romantica": "romantică",
    "religioasa": "religioasă", "prezidiala": "prezidială", "brodata": "brodată",
    "ortodoxa": "ortodoxă", "fotografiata": "fotografiată",
    "pregatita": "pregătită", "cazatoare": "căzătoare",
    "personalizata": "personalizată", "generala": "generală",
    "naturala": "naturală", "spatioasa": "spațioasă", "construita": "construită",
    "memorabila": "memorabilă", "realizata": "realizată", "amenajata": "amenajată",
    "catifelata": "catifelată", "supradimensionata": "supradimensionată",
    "iluminata": "iluminată", "luminoasa": "luminoasă", "nationala": "națională",
    "nationale": "naționale", "traditionala": "tradițională",
    "inscriptionate": "inscripționate", "metalica": "metalică",
    "decorativa": "decorativă", "panoramica": "panoramică", "organica": "organică",
    "tematica": "tematică", "calda": "caldă", "fina": "fină", "vesela": "veselă",
    "ampla": "amplă", "lunga": "lungă", "difuza": "difuză",
    "incadrat": "încadrat", "incadrate": "încadrate", "imbracat": "îmbrăcat",
    "imbracate": "îmbrăcate", "asezat": "așezat", "asezate": "așezate",
    "pudrati": "pudrați", "imbratisati": "îmbrățișați", "impletite": "împletite",
    "plusat": "plușat", "inchis": "închis", "inalte": "înalte",
    "acelasi": "același", "asa": "așa", "incat": "încât", "langa": "lângă",
    "doua": "două", "coborand": "coborând", "formand": "formând",
    "alaturi": "alături",
    # verbe
    "realizam": "realizăm", "transformam": "transformăm",
    "organizam": "organizăm", "ocupam": "ocupăm", "merita": "merită",
    "reflecta": "reflectă",
}

# Forme unde varianta fara diacritice e forma articulata, deci corecta.
# Se corecteaza DOAR in contextele in care e clar nearticulata.
CONTEXT = [
    # „masa/fata/sala/nunta/arcada..." fara diacritice sunt forme ARTICULATE corecte
    # („masa" = the table). Se corecteaza doar acolo unde sunt clar nearticulate.
    (r'\bde masa\b', 'de masă'), (r'\bCentru de masă\b', 'Centru de masă'),
    (r'\bfata de masă\b', 'fața de masă'), (r'\bfete de masă\b', 'fețe de masă'),
    (r'\bdecor masa\b', 'decor masă'), (r'\bo masa\b', 'o masă'),
    (r'\bpe o masă eleganta\b', 'pe o masă elegantă'),
    (r'\bin fata\b', 'în fața'), (r'\bîn fata\b', 'în fața'),
    (r'\bde nunta\b', 'de nuntă'), (r'\bFiecare nunta\b', 'Fiecare nuntă'),
    (r'\bpentru nunta\b', 'pentru nuntă'),
    (r'\b([Aa])rcada (de|decorativă|amplă|organică|din)\b', r'\1rcadă \2'),
    (r'\bcu arcada\b', 'cu arcadă'), (r'\bo arcada\b', 'o arcadă'),
    (r'\bde sticla\b', 'de sticlă'), (r'\bo vaza\b', 'o vază'),
    (r'\bde mireasa\b', 'de mireasă'), (r'\bîn biserica\b', 'în biserică'),
    (r'\bde sala\b', 'de sală'), (r'\bo sala\b', 'o sală'),
    (r'\bsală eleganta\b', 'sală elegantă'),
    (r'\bo terasa\b', 'o terasă'), (r'\broz-pudra\b', 'roz-pudră'),
    (r'\bde cala\b', 'de cală'), (r'\bflori de cala\b', 'flori de cală'),
    (r'\bde pica\b', 'de pică'), (r'\bin forma de\b', 'în formă de'),
    (r'\bîn forma de\b', 'în formă de'),
    # etichete/titluri: aici substantivul e nearticulat
    (r'\bDecor sala\b', 'Decor sală'), (r'\bAmenajare sala\b', 'Amenajare sală'),
    (r'\bsala cu vinuri\b', 'sală cu vinuri'), (r'\bDetaliu masa\b', 'Detaliu masă'),
    (r'\bDecor Masa\b', 'Decor Masă'), (r'\bServicii nunta\b', 'Servicii nuntă'),
]

_RX = re.compile(r'\b(' + '|'.join(sorted(FIX, key=len, reverse=True)) + r')\b', re.IGNORECASE)


def _repl(m):
    src = m.group(0)
    out = FIX[src.lower()]
    if src[0].isupper():
        out = out[0].upper() + out[1:]
    return out


def fix_text(s):
    if not s:
        return s
    out = _RX.sub(_repl, s)
    for pat, rep in CONTEXT:
        out = re.sub(pat, rep, out)
    return out
