def tally_by_hand(votes):
    totals = {}
    for name in votes:                  # for each vote,
        totals.setdefault(name, 0)      # give its name a row
        totals[name] += 1               # and count it
    return totals

def ranking(votes):
    totals = tally_by_hand(votes)
    rows = [(-count, name) for name, count in totals.items()]
    rows.sort()                         # most votes first, then by name
    
    names = []
    for _, name in rows:
        names.append(name)
    
    return names

votes = ["red", "blue", "red", "green", "blue", "red"]

print(tally_by_hand(votes))             # {'red': 3, 'blue': 2, 'green': 1}
print(ranking(votes))                   # ['red', 'blue', 'green']

no_votes = []
print(tally_by_hand(no_votes))          # {}
print(ranking(no_votes))                # []