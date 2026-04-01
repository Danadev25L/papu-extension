#!/usr/bin/env python3
import re

with open('background.js', 'r') as f:
    content = f.read()

# Find the problematic section and fix it
# Pattern: find from "// Set unit dropdown" to "// Set difficulty"
pattern = r'(  // Set unit dropdown.*?\n)(.*?)(  // Set difficulty)'

def fix_indent(match):
    header = match.group(1)
    body = match.group(2)
    footer = match.group(3)

    # Remove the extra closing brace that's not part of any if
    lines = body.split('\n')
    fixed_lines = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Skip empty lines with just closing braces
        if stripped == '}' and i > 0:
            prev = lines[i-1].strip()
            if prev == '}':
                continue  # Skip duplicate closing brace
        # Fix indentation - remove extra spaces from start of unit setting code
        if stripped.startswith('const unitSelect'):
            fixed_lines.append('  const unitSelect')
        elif stripped.startswith('console.log("[Fill] Unit dropdown'):
            fixed_lines.append('  ' + stripped)
        elif stripped.startswith('if (unitSelect &&'):
            fixed_lines.append('  ' + stripped)
        else:
            fixed_lines.append(line)

    return header + '\n'.join(fixed_lines) + '\n' + footer

content = re.sub(pattern, fix_indent, content, flags=re.DOTALL)

with open('background.js', 'w') as f:
    f.write(content)

print('Fixed!')
