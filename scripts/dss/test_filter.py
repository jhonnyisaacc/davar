#!/usr/bin/env python3
"""
Quick test to verify the enhanced filtering (spelling exclusion + substantive inclusion)
"""


from .notes_parser import is_fragment_to_fragment_difference

# Test cases
test_cases = [
    # Fragment-to-fragment (2+ DSS - should return True)
    ("4QSamc: for a decision (implicit). 4QSama reads the explicit אל המשפט and the Masoretic reads למשפט", True),
    ("4QXIIg: not (plene spelling). MurXII and Masoretic have the defective spelling לא.", True),
    ("MurXII, Mas, LXX: prophesy. 4QXIIg has the alternative reading הנביה", True),
    
    # Scholarly single-DSS notes (should return True)
    ("4QSama moves directly from verse 3 to verse 6, completely omitting verses 4 - 5. These two verses were a later, albeit early addition to the text of 2 Samuel", True),
    ("4QIsab: different word meaning darkness. Masoretic reads חשך meaning gloom", True),
    ("1QIsaa reads different verb meaning he multiplied. Masoretic reads they multiplied", True),
    
    # Spelling differences (should return False)
    ("1QIsaa: not (plene spelling). Masoretic have the defective spelling לא.", False),
    ("4QDeutm: all (plene spelling). 4QDeutd, Masoretic and SP have defective spelling כל.", False),
    ("2QDeuta: to your ancestors (plene spelling). Masoretic has defective לאבתיכם.", False),
    ("4QIsac: sycamore-trees (plene spelling). 1QIsaa and Masoretic have defective שקמים.", False),
    ("4QXIIg: with paragogic nun. Masoretic has תקראון without the emphatic nun.", False),
    ("1QIsaa: orthographic alternative. No change of meaning.", False),
]

print("Testing enhanced filtering (spelling exclusion + substantive inclusion):")
print("=" * 70)

passed = 0
failed = 0

for commentary, expected in test_cases:
    result = is_fragment_to_fragment_difference(commentary)
    status = "✓" if result == expected else "✗"
    
    if result == expected:
        passed += 1
    else:
        failed += 1
    
    print(f"\n{status} Expected: {expected}, Got: {result}")
    print(f"   {commentary[:75]}...")

print(f"\n{'=' * 70}")
print(f"Results: {passed} passed, {failed} failed")
