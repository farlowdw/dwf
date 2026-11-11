# bash.sh fixture for prismTheme.test.js: every Bash snippet of a site guide's code-editor examples, joined on 2026-10-26, one "--- from <file> ---" line each,
# so that the Prism token types the editor's languages emit are known (prismTheme.js > ROLE_PRISM_TYPES / UNMAPPED_PRISM_TYPES). A new kind of code on a page: add it here; the test names any type the table lacks.
# --- from multi-lang-totals.sh ---
# Prints each total (the sum of the arguments up to and including that one), space-separated.
running_totals() {
    local totals=()
    for value in "$@"; do
        totals+=("$value") # TODO: add the total so far
    done
    echo "${totals[*]}"
}

running_totals 3 1 4 1 5

# --- from multi-lang-totals.solution.sh ---
# Prints each total (the sum of the arguments up to and including that one), space-separated.
running_totals() {
    local totals=() total=0
    for value in "$@"; do
        total=$((total + value))
        totals+=("$total")
    done
    echo "${totals[*]}"
}

running_totals 3 1 4 1 5

# --- from multi-lang-totals.tests.sh ---
# Tests of multi-lang-totals.sh (site guide > Exercises > In several languages): Bash's check
# compares text, so each case captures what the reader's function prints.
check "running_totals 3 1 4 1 5" "$(running_totals 3 1 4 1 5)" "3 4 8 9 14"
check "running_totals (no arguments)" "$(running_totals)" ""
check "running_totals 7" "$(running_totals 7)" "7"
check "running_totals 2 -2 5" "$(running_totals 2 -2 5)" "2 0 5"

