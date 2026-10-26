# Deriving Prices From Chain Data

This document describes how the `chain` methods derive a daily USD price of
BTC using nothing but the blocks of the Bitcoin chain, why each step is there,
how the method tells whether it is working, and what its limits are.

## Purpose

Historic exchange rates are normally looked up from a third party. That means
a network request to a service that sees which dates are being asked about,
that may rate limit or remove access to older data, and whose answer cannot be
reproduced later by anyone else. The chain is the one data source every node
already has, so a price that is derived from it can be computed offline, gives
the same answer to everyone with the same blocks, and can be audited by
re-running the derivation over the recorded block range.

The derived price is not an exchange price. It is an estimate of the rate at
which people were paying for things in bitcoin on that day, read from the
amounts they paid. What exactly that number means is defined below.

## The Signal

People pay in round amounts of their own currency. Someone sending $100 of
bitcoin produces an output whose value in satoshis is `100 / price * 1e8`. On
any given day there are thousands of such payments, at $10, $20, $50, $100,
$500, $1,000 and so on, and all of them are divided by the same price.

Take the logarithm of every output value. A payment of a round amount `U`
lands at `log10(U) + c`, where `c = log10(1e8 / price)` is the same unknown
for every payment that day. So the round payments form a fixed pattern of
spikes, at the log positions of the popular round amounts, that is translated
as a whole by `c`. Finding the translation finds the price.

Each spike is blurred because the rates behind the payments are not all the
same: the price moves within the day, and wallets quote slightly different
rates at the same moment. So a spike spans roughly one to a few percent of its
value. The spikes sit on top of a background of everything else: non-round
payments, change outputs, consolidations, and so on. The background is dense
and its shape is unknown, but it has no reason to form spikes at round dollar
positions.

## Selecting Payments

Not every output is a payment, and the cleaner the input the sharper the
spikes. A transaction is treated as a payment when it is not a coinbase, has
at most 5 inputs, has exactly 2 outputs, has no OP_RETURN output, and has no
input carrying more than 500 bytes of witness data. Two outputs is the shape of
a regular payment with change. Many inputs, many outputs, and OP_RETURN mark
batching, consolidation and protocol traffic rather than purchases. Large
witness data marks inscriptions and other data embedding whose output values
are arbitrary.

Every transaction is judged on its own. An earlier version also dropped
transactions that spent outputs created earlier in the same set of blocks, to
remove chains of exchange plumbing, but whether a transaction is dropped by
that rule depends on which other blocks are being looked at, so a sample of a
day's blocks and the whole day would not agree on which outputs count. The
rule's benefit was never measured and what it removes is background, which
the matching below is indifferent to, so it is gone.

These filters are plausible rather than proven. Their effect on real blocks
should be measured by running the estimator with and without each one on days
with known prices, and the filters kept only where they sharpen the result.
Change outputs cannot be told from payments by their values, so about half
of the outputs that pass the filters are change. They have no reason to be
round dollar amounts, so they add to the background rather than forming false
spikes, which is what the background removal below is for.

Output values of 1,000 sats or less, or of 100,000 BTC or more, are ignored.

### Round Bitcoin Amounts

Values that are round amounts of bitcoin, any multiple of 1,000 sats, form
spikes of their own that do not move with the price. Each round value is
compared with the values immediately around it, within a tenth of a percent
on either side, and the excess of its count over what those neighbors lead one
to expect is removed as a round bitcoin spike. A round value that sits inside
a spike of round dollar payments has elevated neighbors, so it keeps the
density of that spike and loses only what rises above it.

What cannot be told apart is payers of a round dollar amount who all used
exactly one rate that put them on a round value: their payments look like a
round bitcoin spike and are removed with it. On a day where every payer of an
amount used a rate like that, the amount is lost. Payers whose rates differ
even slightly spread over the neighboring values and are kept. A wallet that
rounds its payments to the nearest 1,000 sats loses most of its contribution
to the signal but does not bias it, since its payments spread over the round
values on both sides of the true position.

The price is also derived with round values counted in full, and the round
shift is how far that moves the price. On synthetic days it is zero to a
hundredth of a percent; a large round shift means the round values carry a
pattern of their own, which is either round bitcoin payments lining up with
the template at some price or round dollar payers all at one rate.

### Repeated Amounts

Payments of round dollar amounts are made at rates that move through the day
and differ from one service to the next, so their values in sats spread over
many neighboring values and an exact value rarely repeats more than a few
times in a day. A flood of transactions from one sender is different: on
real days, chains of one input transactions repeated a handful of exact
amounts tens of thousands of times, forming spikes that the matching can take
for round dollar amounts. Each exact value that is not a round amount of
bitcoin is therefore counted at most ten times in an estimate, which keeps a
flood to a few outputs while leaving the spread of real payments as it was.
Round bitcoin values are left to the comparison with their neighbors above.

What this costs is payers who all paid one amount at exactly one rate, such as
a service that prices in dollars with a rate it holds for hours: the payments
of each amount beyond the tenth are not counted. They are a small part of
the signal on real days, where the cap changed the typical estimate by a
thousandth of a percent.

The cap is a count of exact values, not a share of a spike, so what it does
depends on how many values in sats an amount spreads over. At today's prices a
round amount spreads over hundreds of values and the cap leaves real spikes
alone, taking about 1% of the $10 spike at $100,000 in synthetic days of 20,000
round payments with rates spread by 1%. At a million dollars $10 is 1,000 sats
and the same spread covers a few dozen values, and the cap takes about two
thirds of the $10 spike, a third of the $20 spike and a seventh of the $50
spike. That bends the measured strengths towards the larger amounts, the
direction that favors the tenfold alias described under Aliases and Confidence.
A cap relative to the spread of each amount, as the comparison of round values
with their neighbors is relative, would not, and is left for the next version
of the method.

## Estimating the Price

### The Histogram

The output values are counted into a histogram on a log10 scale with 200 bins
per decade, so each bin is about 1.16% wide. That is a little narrower than
the blur of a spike on a calm day, which lets the spike be located precisely
without splitting it over too many bins. The histogram is normalized to sum to
one so that a day with many payments and a day with few are comparable.

### Excess Over the Local Background

A spike is only a spike relative to what surrounds it. For each bin, the local
background is the median of the bins within 12 bins on either side, leaving
out the two bins immediately next to it, and the excess is how far the bin
rises above that background, floored at zero. The template is matched against
the excess, not the raw histogram.

This matters more than it might seem. Matching against the raw histogram
rewards any position where the background happens to be dense, spikes or not,
and compensating for that requires assumptions about where the background
sits in dollar terms, which is exactly the thing that drifts between years and
price regimes. Matching against the excess makes the estimator indifferent to
the shape and position of the background, so the same procedure works at $300
and at $300,000 without tuning.

The fixed neighborhood is a compromise. On a day where the price signal is
widely dispersed, a spike is wider than the two excluded bins and its own
shoulders enter the background estimate, which understates the spike. That
affects every spike the same way so it does not move the position, only the
measured strength and the margins, and the width of the peak is measured and
reported so that such days can be recognized.

### The Template

The template is the set of round USD amounts people pay. It is not a list of
observations but is generated from the way people round numbers: the leading
digits 1, 1.5, 2, 2.5, 3, 4, 5, 6 and 7.5 at every power of ten from $1 to
$100,000, which gives 46 amounts. These positions are as stable as the habit
of rounding itself.

Each amount also has a prior weight, and this is the one place where the method
encodes an assumption about behavior rather than deriving it. The weight has
two parts. The digit part says that amounts led by 1, 2 and 5 are common and
amounts led by 1.5, 2.5, 3, 4, 6 and 7.5 are rare, which follows the
denominations money comes in. The envelope part says that round payments are
mostly between ten and a thousand dollars: it is a bell curve over powers of
ten, centered on a hundred dollars with a width of one decade, so an amount a
decade away from a hundred dollars keeps 61% of its weight, two decades away
14%, and three decades away about 1%. The prior is a dozen numbers and both
parts can be checked against the measured spike strengths that every estimate
reports.

For a candidate price, the template says which bin each amount should land
in. An amount whose spike would fall below 1,000 sats at that price cannot be
seen there and takes no part, for or against; the share of the prior weight
that is observable at a position is its evidence. The strength of a spike at
an observable amount is the excess at its bin plus its neighbors weighted by a
small kernel spanning two bins either side, which absorbs the blur.

Excess is floored at zero, so even where there is no spike the bins around an
amount add up to something positive, and a position that can see more
amounts would collect more of that noise and win for that reason alone. So
each spike strength is taken above the strength that noise alone produces
there, the trimmed mean of the excess in the surrounding bins with the spike
itself and the highest fifth of the neighbors left out, which brings the
score close to zero wherever there is no pattern, however many amounts are
observable. It is not exactly zero: leaving out the highest neighbors keeps
other spikes out of the noise but also puts the noise a little low, so on
simulated payments with no round amounts at all a position scored about 1% to
2% of what a real pattern of round payments scores at its price, slightly less
where fewer amounts were observable, a difference far smaller than the margin
a price needs over its aliases. The score of a position is the sum of these
strengths above
noise, weighted by the template weights, over the observable amounts, and
it is not scaled up for the amounts that cannot be seen: a position with less
to show for itself is not helped. The search scores every position in the
window, one bin at a time, and a parabola through the best bin and its two
neighbors places the peak between bins.

The search under the prior weights decides the alignment, that is, which
spike is which amount. The strength of every spike is then measured at that
alignment, and the measured strengths are used as the weights to place the
peak within the alignment, within two bins of the position the prior chose,
and to weight the refinement below. The measured strengths cannot be allowed
to choose between alignments: the alignment they were measured at always fits
them best, so using them for that would only confirm whatever the first pass
found. The alignment decision stays with the prior, and everything that
judges whether that decision was right is computed under the prior too.

### Aliases and Confidence

The round dollar pattern looks a lot like itself when shifted. Shift it by a
factor of two and $50 lands where $100 was, $20 where $10 was, $500 where
$1,000 was. The same is true, to a lesser degree, for a factor of five, of
ten, of two and a half, and for every other ratio between two amounts in the
pattern. No estimator can escape this: a pattern that is nearly invariant
under scaling cannot by itself pin down the scale. The data alone cannot say
whether people paid $100 at one price or $200 at half that price.

What breaks the symmetry is that the amounts are not equally popular. A
doubling puts the $20 and $200 spikes onto $40 and $400, amounts hardly anyone
pays, and puts $50 onto $100, which should be the strongest spike but is then
weaker than $200. A tenfold shift keeps every digit in place and is only told
apart by the envelope, that payments of $1,000 are rarer than payments of
$100. That is what the prior weights are for, and it is the only thing they
are for.

Not every ratio is an equally serious alias. Under the prior, and under
realistic spike strengths, the pattern shifted by two scores about 0.8 of the
pattern in place, by five or ten about 0.75, by two and a half or four about
0.4. The ratios below two, 1.2, 1.25, 1.33, 1.5, 1.6, 1.67 and 1.875, score
between 0.2 and 0.01 of the pattern in place, because few of the amounts land
on other amounts under those shifts. So the aliases at ratios of two and
above are the ones that can be mistaken for the price, and the ones below two
are weak but real.

Every estimate reports a confidence: the score of the best position divided by
the best score among its alias positions, which are the best position shifted
by the ratio between any two amounts in the template, in either direction, at
possible prices. An alias position only competes when it shows a
multi-denomination pattern of its own, several observable amounts with spikes
of at least a fifth of its strongest, so that a lone stray spike that happens
to land on one template amount is not treated as a rival price. Each position
is scored against the whole histogram through the amounts it can see there; two
candidate prices explain the same bins through different amounts, so this is
the like for like comparison, and the noise correction keeps a position from
winning merely by seeing more amounts. Both scores use the prior weights. The
confidence is reported as at most 100, which is what it is when no alias
position competes, because none shows a pattern that scores above noise, and
also when the best position scores more than a hundred times better than the
best alias. Real days are nowhere near that: every confidence logged on real
days while developing the method was below 1.3. A clear day gives a confidence
around 1.2 in synthetic data. A confidence near 1 means the data cannot
distinguish the price from a multiple of itself, and a confidence below 1 means
an alias outside the search window fits better than anything inside it, which
is a sign that the window was in the wrong place.

At high prices the small amounts fall under 1,000 sats and cannot be seen: $10
at a million dollars, $50 at five million. The floor is in sats while the
envelope is in dollars, so as the lower side of the envelope disappears, the
position a decade below the price sees amounts that the envelope favors about
as much as the price itself does. In synthetic days of 20,000 round payments
drawn from the prior, an estimate without a guide at a million dollars found
the price but was refused for a confidence of 1.09 to 1.10 against the 1.12 it
needed. At three and five million dollars it found a tenth of the price, with a
confidence of 1.09 to 1.20 against the 1.11 it needed and every other measure
healthy, and was supported in three of four runs. So far above today's prices a
starting price can be off by a factor of ten. A guided estimate cannot land on
a tenth of its guide, since neither its window nor the widened window reaches
that far, but the alias is still scored against it, since alias positions are
only limited to prices that are possible at all. In the same synthetic days,
guided by the true price, the estimate found the price every time, but its
confidence was 1.07 to 1.10 at a million dollars, about 1 at 1.8 million, 0.95
to 0.98 at two million and 0.88 to 0.92 at three million, so from about two
million dollars a guided day is refused. That is a regime the prior has not
been built for, and it is discussed under Limits.

The confidence says how well the prior separates the scale. It does not say
whether the price is right in any other sense, which is why the other health
measures below exist.

### Refinement

The rough price is accurate to a fraction of a bin. To do better, every output
is asked which round amount it is close to at the rough price. An output
within nine percent of a template amount implies the exact price at which it
would have been exactly that amount, and those implied prices are counted into
a fine histogram with 1,000 bins per decade, each weighted by the measured
strength of its amount. Nine percent is less than the spacing between
neighboring template amounts, so an output can imply at most one price.

Round payments all imply the true price and pile into a peak. The other
outputs imply prices spread smoothly across the histogram, because their
values are spread smoothly. The background of each fine bin is the median of
the bins that are not near it and is subtracted, the excess is smoothed with a
small triangular kernel to gather the peak, and a parabola through the top of
the peak places its center. When the peak is wider than the kernel, the kernel
is widened to match, up to a limit. The histogram is then rebuilt centered on
the center that was found and the center taken again, until it moves by less
than half a fine bin, so that the result does not depend on where in the
histogram the peak first landed. The center of the settled peak is the price.
Recentering stops after five passes, and a peak that is still moving then is
reported as unsettled. That alone does not refuse the estimate: an unsettled
estimate that passes every rule under Supported, Weak and Undetermined is
accepted, which mostly means its refinement moved by less than one percent
when started three percent higher or lower, as when a broad peak wanders the
same way from every start. On synthetic days that trended 8% to 25%, about
half of the refinements of whole days did not settle, and a few of those
passed every rule, one of them 7.2% from the middle of a day that moved 25%.
A full day is normally priced from its windows of about two hours, which
rarely trend that much, so an unsettled estimate of a whole day only sets the
price of a day whose supported windows cover less than half of it, while an
unsettled bridging estimate can set the window of the next day. Refusing an
unsettled estimate, at least when its search was not confined to a window, is
left for the next version of the method, since it changes which days are
supported and so needs the shipped prices to be derived again.

The refinement is then repeated from starting prices three percent above and
below the rough price, and with a range of six percent instead of nine, and
the stability is the most the price changed. On synthetic days it is zero to
a hundredth of a percent on calm days and around half a percent on days with
a wide dispersion of rates.

This replaces an earlier refinement that rounded every output to the nearest
five dollars and took the median of the implied prices. That approach was
anchored to its own starting point: outputs that are not round payments imply
prices that are spread symmetrically around whatever rough price was used, so
the median was a compromise between the rough price and the truth, weighted by
how much of the data was signal, and it could return the rough price almost
unchanged while appearing to have refined it. Removing the background before
taking the center, and recentering until the center settles, means the rough
price only decides where to look and cannot pull the answer towards itself.

### What the Daily Price Means

The price at the center of the peak of round payments is the rate at which
the typical round payment was made, on a log scale, after the background is
removed. For a calm day that is close to a payment weighted median of the
day's rates. On a day where the price trended it sits near the rate at which
the most payments happened, which need not be the middle of the range, since
payments crowd into the hours people are awake. Measured against the median
of the day's hourly prices, the peak of a whole day that moved 5% to 6% was up
to 3.8% away.

So a full day is priced from consecutive windows of about two hours, each with
a sharp peak of its own, and the price of the day is the time weighted median
of the windows: the price the day spent as long above as below, which is what
the reference used for validation measures too. Across the five years of prices
shipped with the method, the ten days that moved most, 10.4% to 15.4% from open
to close, were all within 1% of the reference, six of them within 0.1%. The
width of the peak in each window is reported as its dispersion, and the windows
themselves show how the price moved through the day.

## Health Measures

Every estimate reports several measures of its own quality, each catching a
different way the method could fail.

The payments count is the number of outputs in the refinement peak above the
background. It estimates how many genuine round payments the price rests on,
unlike a count of outputs that merely fall in a window, which would include
the background. It is a count at the peak, not for the day: on a day whose
price moved several percent the round payments are spread along the path the
price took and only those near the mode are counted, so the count falls as
the move grows, which on real days is a strong relationship. The same count
is taken at every other position in the
refinement range away from the peak, and the largest of them is the noise:
the best that a peak made of nothing achieved across all the positions that
were searched. The significance is the payments beyond the noise, in standard
deviations of the counts in the peak region. It is calibrated against the
search rather than against the winning position alone, so that a peak that
only slightly beats the best noise peak counts for little however many
outputs there were.

The confidence, described above, is the margin over the patterned aliases
under the prior, and the agreement is the cosine similarity between the
measured spike strengths and the prior weights. In synthetic data the
agreement is about 0.9 at the true price and about 0.6 at an alias, so a
falling agreement over time is the signal that the prior is drifting away from
how people pay, and the reported spike strengths are the means to refit it.
The evidence is the share of the prior weight that was observable at the
price; it is 1 at today's prices and falls as the price rises and the small
amounts drop below 1,000 sats.

The coverage is the share of all spike-like excess, across the span of the
template, that sits at round dollar positions. Spikes that are not at round
dollar positions, whether from another currency or from a service paying a
fixed odd amount, lower it.

The rivalry is the best score the pattern achieves at any other position
within a factor of two of the price that shows a pattern of its own, beyond
the dispersion of the peak, divided by the score at the best position. That
includes the weak aliases at ratios below two, which no window wide enough for
a daily move can exclude, and it includes round payments in a second currency
at its exchange rate: in synthetic data a euro pattern with half the volume of
the dollar pattern gives a rivalry of 0.5 at exactly the exchange rate, and
one with equal volume gives a rivalry near 1, at which point the method cannot
say which currency it is pricing. On a clean day the rivalry is about 0.2,
from the 1.5 ratio alias.

The dispersion is the width of the refinement peak at half its height, as a
fraction of the price, beyond the width that the smoothing of the histogram
gives every peak. The smoothing turns even a perfectly sharp peak into one
about 2% wide, so the smoothed width is a floor, not a measurement, on a calm
day; the floor is removed in quadrature, so a peak as sharp as the histogram
can resolve has a dispersion of zero, and a calm real day reads about 1%. The
smoothed width itself is still what decides how far from the peak a rival
position must be. The dispersion is that of the observed price signal, not a
measure of market movement: it reflects both the price moving during the
blocks that were used and wallets quoting different rates at the same time.
A day whose price stepped from one level to another does not read as wide at
all, since each level forms its own sharp peak; it is the rivalry that reports
the second level, and the drift that reports the step.
To tell the two apart, when a day's worth of blocks is used the price is also
estimated from the first half of the blocks and from the second half, and the
drift is how much the second differs from the first. A price that moved shows
a drift of the same order as the dispersion; dispersion with little drift is
rate scatter. The spikes themselves are reported as the measured strength of
each template amount relative to the strongest, and the round shift and the
stability are described above.

## Supported, Weak and Undetermined

An estimate is supported when at least three template amounts form spikes of at
least a fifth of the strongest, at least 100 round payments are in the peak,
the peak is at least four standard deviations beyond the best noise peak, the
refinement moves the price by less than one percent when its start or its range
is changed, every patterned rival position scores less than nine tenths of the
best, at least half of the prior weight was observable, and the price beats
every patterned alias. When the search was confined to a window around a known
price, beating the aliases means a confidence of at least 1. When it was not,
because there was no known price or because the window was widened, it means a
confidence of at least 1.1 with the whole pattern observable, and a margin that
grows as the observable evidence shrinks, one plus a tenth divided by the
evidence, since then the prior is the only thing excluding the aliases and less
of the pattern is there to support it.

A sample estimate that is not supported, or that rests on fewer than 500
payments, is weak, and is retried with twice as many blocks until it is
supported or all the blocks of the day have been used.

A full day is estimated both from all of its blocks at once and in consecutive
windows of twelve blocks, about two hours each, with a last window of fewer
than six blocks joined to the one before it. Each window is judged by the same
rules in the same price window, and a window whose search had to be widened is
not counted, even when the price it found is inside the price window after all,
as happens when its best position is within three bins of an edge. A window
covers the time from the block before it to its own last block, by their median
times past, described below. Timestamps can run backwards from one window to
the next, and the time they went back would then be counted again by the next
window, while the median time past never goes backwards, so every second of the
day is counted once. When the counted windows cover at least half of the day,
the day is supported, and its price is their time weighted median; otherwise
the estimate from all of the blocks at once is used when it is supported. On a
day that trends to an edge of the price window, the windows that were widened
can leave less than half of the day counted, and the day is then priced from
all of its blocks at once; counting such windows is left for the next version
of the method. The measures reported for a day priced from windows are those of
the median window, except for the outputs and payments, which are the totals of
the counted windows. A sample that is still not supported once all of the
blocks of its day are used is estimated in windows the same way.

A day that its windows do not support either is undetermined. It is not
remembered, not used to guide any other day, and the price lookup fails with
an error that names the day, so that a report built on it fails loudly rather
than carrying a guess.

The thresholds are set from synthetic data and are deliberately conservative.
They need to be calibrated on real blocks, as described under Validation.

## Finding the Blocks of a Day

A day is a UTC calendar day, and a block belongs to the day its median time
past falls on. The median time past of a block is the median of the
timestamps of the block and the ten blocks before it. Consensus requires every
block's timestamp to be later than the median time past of the blocks before
it, so unlike timestamps, which miners can set a couple of hours off and which
can run backwards from one block to the next, the median time past never
decreases with height. That makes every day a contiguous range of heights that
a binary search finds exactly, and that can never change because a later block
carries an earlier time. The median time past lags the clock by about an hour,
which is immaterial for a daily price.

A day is complete when at least six blocks have been mined after its last
block. With the day defined by median time past, completion is purely about
the chance of a chain reorganization replacing the blocks of the day, which six
confirmations make negligible. Only complete days get a final price.

## Estimating Day After Day

Because of the aliases, the estimator should never search blind when it does
not have to. Once one day's price is known, the next day's search is confined
to a window from 0.62 to 1.2 times that price. The window spans less than a
factor of two, so no price in the window has its double or its half in the
window too, which keeps out every alias at a ratio of two or more: the ones
that score close to the price itself. The weak aliases at ratios between 1.2
and 1.875 can be inside the window with the price; they are not excluded by
the window but are checked by the rivalry, which must stay below nine tenths
for the estimate to be supported. The window reaches further down than up
because falls have been sharper than rises.

The window is a guide, not a wall. When the best position is within three bins
of the edge of the window, or when an alias outside the window scores better
than anything inside it, the search is repeated in a window twice as wide on
each side, and the result is accepted only if it beats its aliases by the clear
margin, and is reported as widened, even when the price it finds turns out to
be inside the window. A real move of forty percent in a day is found that way.

A window placed on the wrong scale is not stable either. Suppose a day were
stored at double its true price. The next day's window would be centered on
that double, the true price would be outside it, and the best position inside
it would be the alias at double the truth. But the true price is an alias of
that position, so it is scored too, under the prior, and when the prior
prefers the truth, the confidence comes out below 1, the search widens, and
the true price is found with its clear margin. The chain of estimates heals
at the next day. What it cannot do is decide which of the two days was wrong:
the widened result then sits at an alias ratio of the day that guided it, and
one of the two is misplaced. That is treated as a scale conflict, the estimate
is not stored, and the lookup fails with an error naming both days and both
prices, so that the question is settled by checking one of them against the
world rather than by storing a file that disagrees with itself.

The conflict test takes a ratio within six percent of a ratio between two
amounts of the pattern, of two or more, as an alias ratio, and nearly every
ratio from 1.89 up is within six percent of one, apart from narrow bands such
as 2.12 to 2.26. So a real move from one day to the next of 47% or more down,
or 89% or more up, almost always ends as a scale conflict rather than a price,
and such a day is settled against the world like any other conflict.

The case that nothing inside the method can detect is a prior that prefers the
wrong scale on every day, which is discussed under Limits. It is the reason
that a price estimated without a guide is logged as a starting point and should
be checked against any exchange, and the reason the validation below exists.

When no price is known at all, the most recent complete day is estimated first
with an unconstrained search, which is where the clear margin applies. The
present is the regime the prior describes best, and the result can be checked
against any exchange immediately. A day that does not clear the margin on its
own, which on real days happens about once a month when the day's mix of
amounts happens to read well under a relabeling, is not a reason to fail: the
day before it is tried, and the one before that, for up to a week, and the
first day that identifies its price on its own is the starting point. The
same start is made when every known price is more than a week farther from
the requested day than the most recent complete day, since bridging back from
the present is then the shorter way.

Days between known estimates and the requested day are bridged one day at a
time. A bridging estimate uses an evenly spaced sample of 12 of the day's
blocks, one from the middle of each twelfth of the day's blocks, and doubles
the sample while the estimate is weak, keeping the blocks it has and adding the
blocks halfway between them, so that each doubling only fetches new blocks. A
day that is still not supported once the sample is the whole day is estimated
in windows, so that a day the price moved a lot in does not stop the bridge.
Each block is retrieved once however many estimates of the day use it. Bridging
estimates are kept as priors, used only to guide neighboring searches, and are
replaced when a day gets a full price.

A day that cannot be priced stops a lookup that has to bridge through it, with
an error that names the day, so that it can be checked against an exchange.

The day of the requested date itself is priced from all of its blocks, in
windows as described under What the Daily Price Means. A date on a day that is
not yet complete gets a provisional price from the confirmed blocks of the day
so far, padded with the blocks just before the day when the day has fewer than
36 confirmed blocks, so that a provisional price measures the same thing as the
final price as far as the data allows. The latest complete day is bridged to
first when it has no estimate, so that the guide of a provisional price is
never further back than that day, which is the day before except in the hour or
so after midnight, when the day before is not complete yet. When the latest
complete day is undetermined, the provisional price is guided by the nearest
other estimate instead of failing. A provisional price
is kept apart from the full day prices with the blocks it was derived from and
reused until about six more blocks have been mined, about an hour, after which
it is derived again, so that looking up the current day again does not fetch
its blocks each time. Once the day is complete, its full price replaces it. A
day that starts more than six hours after the median time of the chain tip is
refused, since the chain has not reached it and a provisional price would only
come from older blocks, as when the node is still syncing; six hours is the
span of the padding, and well beyond how far the median time lags the clock,
even when blocks are slow.

## Remembering Prices

Full day prices are kept as rates, bridging estimates as priors and the
provisional prices of the latest days apart from both in a JSON file. The file
carries a version of its own format, so that a reader can tell a file written
in another layout from one it understands. Each record carries the price, the
block range it was derived from, the hash of the last block in that range, and
a version made of the method version and a hash of the template, which is
separate from the file format version. Rates also carry the output and payment
counts and the main health measures, which show how well a price was supported
without its blocks, though not every input of the support rule, and they mark a
price that was estimated without a guide. Checking a price fully means deriving
it again from its block range, which the hash and the version make
reproducible.

Records whose method version does not match the running method are ignored, so
a change to the method or the template causes prices to be derived again rather
than mixing prices from different methods, without discarding the file. Records
whose last block is within about a week of the chain tip are checked against
the chain before use. A record whose block hash no longer
matches, because the chain was reorganized or the file came from another chain,
is removed from the file for good, as long as the file still holds that same
record rather than a newer price for the day, and the day is derived again when
it is needed. A record whose last block is beyond the chain tip, as when the
node is catching up after being down or another node shares the file, cannot be
checked yet, so it is left out of that lookup and kept in the file, to be
checked once the node reaches its block.

Every write merges with what is already in the file, so two processes deriving
prices at the same time add to each other's work instead of replacing it, and
each write goes to a temporary file of its own that is swapped into place so
that a reader never sees a partial file. Two writes that overlap by moments can
still lose one new entry, which is only derived again later. A full day rate
replaces the prior and the provisional price of its day only when they are of
its own version, so that a rate left by another version does not take the place
of current prices. A file that cannot be read, or whose format is not
understood, is an error rather than an empty file, and nothing is written over
it, so prices that could not be read are never replaced. An empty file is an
empty set of prices, and an entry that is not a price for a day of the calendar
is dropped rather than read. A lookup of a shipped day reads neither the node
nor the file, so a damaged file only fails the days it is needed for.

## Prices Shipped With the Method

Deriving a price takes the blocks of its day, and reaching a day takes a bridge
from a known price, so a first lookup far from the present waits for a long
bridge. The prices of every day up to a release are therefore derived before
the release and shipped with the package, and a lookup on one of those days is
answered from them without asking the node for anything. A day after them is
reached from the last shipped day, so a lookup a month after a release bridges
a month rather than from the present, unless the present is more than a week
closer, as it is for a recent day looked up long after a release.

The shipped prices are derived exactly as a lookup derives a requested day,
from all of the blocks of each day, guided by the day before it, using a local
Bitcoin Core. Before they are written, every new day has to be priced, and its
price has to fall within the range the day traded in on Coinbase Exchange, from
its lowest to its highest trade, which catches a day placed on the wrong scale
or pulled away by a flood while leaving room for where the payments of a day
that moved a lot were made. A price a percent or two off would still pass that
check, so every new price is also compared with the median of the hourly prices
of its day, and a price more than 5% from it stops the run to be looked into,
since none of the 1,824 shipped days measured against that median was more than
3.06% from it. On a version change each new price is also compared with the
price the day had before, and the run ends with the median, 95th percentile,
bias and largest of each comparison, to be looked over before the prices are
committed. The most recent shipped days are also derived again and have to come
out exactly as they were, which catches a change to the method that was not
given a new version. When the method version changes, every day is derived
again. When earlier days become supported, only they are derived, bridging back
from the first shipped day and then forward a day at a time, and the first
shipped day is derived again from its new neighbor and has to come out exactly
as it was.

The file is JSON holding the method version and the price in cents of each
day under its date, about 27 bytes a day, and it is only read the first time
a price is needed. Shipped prices are never written to a user's prices file,
and anyone with a node can derive them again with the same script.

## Accuracy

On synthetic days built from a realistic mix of round payments over a dense
background, the estimate is within 0.05% of the true price across prices from
$250 to $1,000,000, including days where the background is centered far from
where payments usually are, days where only 1% of outputs are round payments,
and days where the rates behind the payments were dispersed by 1%. Bridging
through 30 synthetic days that include falls of 35% and rises of 27% tracks
every day within 0.12%, with the large moves found by widening the window.

Adversarial synthetic days behave as follows. A day where only 0.3% of outputs
are round payments is misread by a factor of two and is correctly refused for
a significance below 1. A day whose rates trend 15% across the day is placed
within 1.6% of its midpoint with a dispersion of 10% and a stability of 0.6%;
a day with a 30% trend is placed 9% from its midpoint and is refused for a
stability of 1.5%, which is the right outcome, since such a day has no single
price. Payers who round their payments to the nearest 1,000 sats cost signal
but no accuracy, even at 80% of payers, and move the round shift by two
hundredths of a percent. Round payments in euros at half the dollar volume
have no effect on the price and give a rivalry of 0.5; at equal volume the
method prices the euro pattern and is refused for a rivalry of 0.99 and a
significance of 3. A service paying one fixed odd amount in 10% of all payment
outputs would move the price by 20% but is refused because it leaves fewer
than three spikes in the pattern. A window placed on the wrong scale by a
factor of two or five is detected with a confidence well below 1. A day on
which every payer of an amount used one rate that put it on a round value, at
a price of exactly $50,000, loses the pattern and is refused, with a round
shift of over 200% showing that the round values carried it.

## Validation

Synthetic data can only show that the mechanism works and that its failure
modes are the ones expected. The thresholds above, how well the prior
describes real payments, how large the margins really are, and what the health
measures look like on real blocks, have to be measured against known prices on
real blocks. `npm run check-prices` does that for a list of dates without
storing anything: it derives each price from a cold start, takes a reference
price for the day from an exchange, and reports every estimate's record
alongside its difference from the reference. It runs with a local Bitcoin
Core, like the script that updates the shipped prices.

The reference is the median of the typical prices of the day's hourly candles
on Coinbase Exchange, which go back to early 2015 and need no key: the price
the day traded above for half of its hours and below for the other half. A
time weighted measure is chosen on purpose. The chain price is where the most
round payments were made, and payments are spread through the day with the
hours people are awake, while exchange volume piles into the hours when the
price moves most violently, so a volume weighted average is dragged toward a
crash in a way the payments are not. The volume weighted average is reported
too, along with the day's first and last trades, and on a calm day they all
agree. When a day has no candles, CoinGecko's prices for the start of the day
and of the next day stand in, with their geometric mean as the reference, but
CoinGecko's public API only serves the past year.

The first measurements below were made against that pair of midnight prices
for every day, before the hourly reference existed, and it is a crude
instrument: two midnight prices say little about where a day that trended
spent its payments, so on a day that moved a few percent a difference of
around a percent was expected, with its sign following the trend.

The same comparison can be run unguided, with `--unguided`: each date
is estimated from the blocks of its own day with no price window from a
neighbor and no bridging, exactly as a cold start is, and the estimate is
reported whether or not the data support it, together with whether they do.
This is the direct test of the method's central claim, that one day's
payments identify the price on their own, and because it costs one day of
blocks per date rather than bridging from the present it is the practical
way to cover many dates across price regimes: the few hundred dollar days
with sparse payments, fee spikes and inscription waves that fill blocks with
dust, crash days, days when the price sat near a round number so that round
BTC and round USD values coincide, and days above $100,000 where the smallest
denominations fall below the minimum observable output. The estimates to study
are the ones that are wrong while supported and right while unsupported,
since those are what would change the support rule.

A cold start happens on the latest complete day. Every other day is reached by
bridging, with a neighboring day's price as its guide, which is the day after
it when bridging back from the present, so a day that cannot be priced on its
own blocks is not by itself a problem. What would be is a guided
estimate that is wrong and still supported, since bridging accepts it and uses
it to guide the day before. The comparison can be run reference-guided to look
for that, with `--reference-guided`: each date is estimated from the
blocks of its own day in the window that a correctly bridged neighbor would
give it, the window around the reference price of the next day, or around its
own reference price with `--own-reference`, and the search is widened and
checked for a scale conflict with its guide exactly as in a derivation. It also
costs one day of blocks per date. The guide stands in for a neighbor's chain
price, which on recent days is within a fraction of a percent of the reference.
The estimate is of the whole day, as for the requested day of a lookup, or with
`--sampled` of a sample of its blocks, the way bridging estimates every other
day: a dozen evenly spaced blocks, doubled until the estimate is supported and
rests on at least 500 round payments or the whole day is used.

The first real measurements, guided, were on the 30 consecutive days ending
October 16, 2026, with 18,000 to 36,000 round payments a day. All 30 were
derived, the median absolute difference from the reference was 0.25%, 22 were
within 0.5% and 27 within 1%, and the signed mean was +0.06%, so there was no
bias. The difference correlated 0.85 with the day's move from open to next
open, the chain price lay between the two opens on 21 of the 30 days and was
never more than 0.5% outside that range, and on the two days that moved 6% to
7% the chain price sat near the next day's open, the moves having happened
early in the day, with differences of 2.4% and 3.0% that are the reference's
failing rather than the chain's. The payment count correlated -0.73 with the
size of the move, as expected of a count at the peak. The health measures were
where the synthetic data put them: confidence 1.05 to 1.21 with a median of
1.17, rivalry 0.21 to 0.34 except for 0.55 on the day with the step change,
where the earlier level formed the rival, and stability at most 0.001. The two
lowest confidences, 1.05 and 1.11, were on the two days with the most
payments, both priced to within 0.2%. On the lower of the two the strongest
spike was at $2.50 instead of the usual $100 or $50, a burst of payments of
that size, and under a relabeling at twice the price $2.50 reads as $5, one of
the heaviest amounts in the prior, which narrowed the margin over that alias.
Derived on its own blocks with no guide, the day came to the same price to the
cent but was not supported, as it should not be when its payments alone
distinguish the price from its double less clearly than usual, and that is why
a cold start steps back from a day it cannot support rather than failing.
Those are the easy regime, recent days with abundant payments, and leave the
thresholds with wide margins there.

The first unguided measurements covered seven days from December 2023 to
October 2026, again against the pair of midnight prices. All seven were
supported on their own blocks. The day of the 2024 halving, when the fees paid
for a new token protocol left 5,341 round payments, about a quarter of the
count of a day a month before, was within 0.52%, and a day in the inscription
wave of December 2023 with 11,326 was within 0.42%. The three days above
$100,000, where the $1 amount falls below the smallest observable output, were
all supported; they were picked for large moves inside the day, and differed
from the midnight prices by 1.6% to 4.6%, which is what the hourly reference
is meant to settle, so they are to be measured again against it. October 13,
2026 came to 83,269.28 on its own blocks, the same price to the cent as in two
runs that reached it by bridging from a neighbor, which is the window doing
what it is meant to do: excluding aliases without moving the price.

Five days of the earlier regime have been measured unguided, against the hourly
reference, and none was supported. Three were wrong: December 17, 2017 came to
$102.01 against $19,489.49, June 26, 2019 to $5,008.25 against $12,603.35, and
March 12, 2020 to $10,023.34 against $6,170.90. Each locked onto a price just
above $100, $5,000 or $10,000, where round amounts of bitcoin are also round
dollar amounts: at $10,000, 0.001 BTC is $10. Round amounts of bitcoin sent
with the fee taken out of the amount would do that, since they sit just below
the round values, where the comparison with neighboring values, which only
removes exact round values, leaves them in place, and they read as round
dollars at a price just above the round number. The first two fell short of the
margin over the aliases, with confidences of 1.03 and 1.01, but March 12, 2020
cleared it at 1.43 and was refused by another of the checks, so the margin
alone would not have caught it. The other two days, May 19, 2021 and November
9, 2022, both of which fell 14%, were right, within 0.93% and 0.25%, and fell
short of the margin, with confidences of 0.94 and 1.05 and rivalries of 0.42
and 0.44, above the recent days' range. The coincidence prices, one, two or
five times a power of ten, do not move with the price, and no two are more than
two and a half times apart while a guided window spans almost two, so most
windows contain one; the window for June 26, 2019 contains $10,000. A guided
estimate only needs a confidence of 1 to be supported, so the next measurements
are of the same days, reference-guided.

A year of days, October 20, 2025 to October 18, 2026, was then checked
reference-guided from samples, the way bridging estimates them, against the
hourly reference. 358 of the 364 days were supported, with a median absolute
difference of 0.12%, 95% of them within 1.33% and none more than 3.88% off, and
no bias. All 161 days that moved less than 1% from open to close were within
0.95%, and every difference over 2% was on a day that moved at least 2%, where
a single price for the day says little. Three of the six days that were not
supported were floods of repeated amounts. On May 9, 2026 eight exact amounts
from 1,046 to 2,146 sats, nearly all in one input transactions and most of
those spending a transaction of the same amount, made 22% of the day's payment
outputs and pulled the estimate onto a pattern of $1 and $1.50, and on March 22
and 23 a family of amounts from 3,451 to 3,553 sats, each repeated hundreds to
thousands of times, put March 23 at twice its price. Counting each exact amount
at most ten times priced all three within 0.8% from the first sample, and that
is now part of the method. Across the whole year it supported 361 of the 364
days, moved the typical price by a thousandth of a percent and 95% of days by
less than 0.04%, brought 95% of days within 1.2%, and improved nine of the ten
days it moved by more than 0.1%, among them the three floods and days next to
them that were partly flooded. The other three, December 2 and 15, 2025 and
February 25, 2026, moved 2% to 6% during the day and were right as a whole but
not supported, because the payments spread over the day's range read as noise.
Estimated in windows of twelve blocks, every window of those three days was
supported, and so was every window of two days that moved 5% to 6% and of a
calm day, 71 windows in all. The windows followed Coinbase over the same hours
with a median difference of 0.04% to 0.13% a day and at most 1.08%, in the
window a crash happened in, and the time weighted medians of the windows were
within 0.2% of the reference on all six days. On seven days that moved 4.8% to
12.3%, the time weighted median of the windows was within 0.95% of the
reference where the peak of the whole day was up to 3.8% away, and since then
every full day is priced from its windows. With both changes in the method, a
lookup that bridged from October 19, 2026 back to October 20, 2025 reached
every day, and the six days it priced in full, among them two of the floods
and the three days that had needed windows, were within 0.78% of the
reference.

The four years before, October 20, 2021 to October 19, 2025, were checked the
same way with the method as it now stands. Two days, January 31 and February 1,
2023, were left unchecked when Coinbase answered the request for their prices
with a server error, and every one of the other 1,459 days was supported, with
a median absolute difference of 0.12%, 95% of them within 0.93% and none more
than 3.79% off, and no bias. All 613 days that moved less than 1% from open to
close were within 1.93%, the eleven differences over 2% were on days that moved
more than 1% and were estimated from samples of about two hours, and the 121
days within 3% of $20,000, $50,000 or $100,000, where round amounts of bitcoin
are also round dollar amounts, were all supported and within 2.33%, among them
the summer of 2022 that the price spent near $20,000. November 9, 2022, which
fell 14% and was short of the margin on its own blocks, was within 0.68%
guided. Prices are therefore derived from October 20, 2021 on.

The shipped prices, every day from October 20, 2021 to October 22, 2026, were
then derived, each day from all of its blocks and guided by the day before, and
every day fell within the range it traded in on Coinbase. Against the hourly
reference, on the 1,824 days it covers, the median difference was 0.06%, 95% of
days were within 0.38%, 1,813 within 1% and all but two within 2%, with no
bias, and each year's median was between 0.04% and 0.07%. The largest
differences were 3.06% on September 13, 2022, a day that fell 9.9%, where the
price was within 0.08% of the day's volume weighted average price, and 2.12% on
March 4, 2024, a day that rose 8.2%. The 51 days within 3% of $20,000 had a
median difference of 0.07% and were all within 1.7%. Counting the time of each
window by the median time past of its blocks instead of their timestamps moved
526 of the days from the previous table, by a median of 0.07% and at most
2.15%, and brought August 8, 2024, a day that rose 11.9%, from 2.63% to 0.42%
away from the reference.

The calibration should be done on one set of historical periods and tested on
another, across price regimes, from the thousand dollar prices of early 2017,
the earliest days the method is meant to support, to the present, and it should
look hardest at the estimates that are wrong while passing every check, since
those are the ones a user would never notice. The expected pattern is that the
measures separate the wrong estimates from the right ones; where they do not,
the measures are incomplete, not the data.

## Manipulation

Someone who wanted to skew the derived price would have to create payments
that look like round dollar payments at a different price, in enough volume to
outweigh the real ones. The estimator weighs outputs, not value, so the cost
is in transaction fees: a two output transaction is about 140 virtual bytes,
so at a fee rate of 1 to 5 sats per virtual byte each forged payment costs
about $0.10 to $0.50 at a $70,000 price. Real round payments are on the order
of tens of thousands a day, so matching them costs thousands of dollars a day
and takes a few percent of the day's block space, and doing so for a whole
month costs on the order of a hundred thousand dollars and is visible as a
sustained change in the payment count and the spike pattern. Forging a single
spike is cheaper but is refused as not being a pattern; forging the whole
pattern at a wrong scale is detected as a rival when the volumes are
comparable, and only succeeds silently when the forged volume clearly exceeds
the real one.

Weighting payments by the fees they paid would raise the cost of such an
attack, but fees are not visible in the block data available here, since they
require the values of the inputs being spent, and the proxies that are
visible, such as position in the block, are weak. The practical defense is
the one above: the measures that change when the data changes, and the record
of what every price was derived from.

## Limits

The price is for the currency whose round payments dominate, which is the
dollar. Round payments in other currencies form their own pattern at their own
rate; while the dollar pattern is the larger, the others only lower the
coverage and raise the rivalry, and if another currency's round payments ever
matched the dollar's, the method would price that currency instead and the
rivalry near 1 would say so. The method is mainnet only, and dates before
October 20, 2021 are refused for now. Every day since then has been checked
against exchange prices, while earlier years have only been sampled, and of the
four days measured before then none was supported on its own and three locked
onto prices where round amounts of bitcoin are also round dollar amounts, which
needs work before those years are supported.

The prior weights are the one assumption about behavior, and the scale of
every price rests on them. If people's payment habits shifted so that every
amount was paid as often as twice that amount is paid today, the data would be
indistinguishable from the same habits at half the price and no method could
tell the two apart. If payments of a thousand dollars became as common as
payments of a hundred, the envelope would be wrong and the scale could be off
by ten. A prior that is wrong in one of these ways is wrong on every day, so
the chain of estimates would be coherent and no check inside the method would
fire; the agreement would drift and the measured strengths would stop
resembling the prior, but only a comparison with the world settles it. Such an
error can only enter at a cold start, since a day guided by a correct neighbor
searches a window where no strong alias can be, and a day guided by a wrong
neighbor is caught as a scale conflict when the prior prefers the truth.

A day whose round payments come in only one or two amounts cannot be placed
by the data, since one spike could be any amount, and the method refuses it
when the pattern has fewer than three spikes but can be misled when it has
exactly the wrong two. A day on which every payer of an amount used the same
rate, and that rate put the amount on a multiple of 1,000 sats, loses that
amount. A day on which the price signal is dispersed by more than ten percent
has no single price; the estimate is somewhere within the range, the
dispersion says how wide the range was, and the stability check refuses the
widest.

The estimate depends on there being many round payments in a day. Sampled
estimates of a few thousand outputs can be weak and are escalated; full days
of a hundred thousand or more outputs are not weak in testing. A large share
of non-round junk concentrated in a narrow band of values can create a spike
of its own and mislead the matcher if it is accompanied by enough other spikes
to pass as a pattern.

Far above today's prices two parts of the method stop working as intended,
because they count in sats rather than in dollars. The floor of 1,000 sats
hides the smallest amounts, and the cap of ten on each exact value trims real
spikes of small amounts once a round amount spreads over few values in sats,
about two thirds of the $10 spike at a million dollars with rates spread by 1%.
Both push an estimate without a guide towards a tenth of the price, which from
about three million dollars it can accept, as described under Aliases and
Confidence. A guided estimate still finds the price, but from about two
million dollars a tenth of the price outscores it, and since widening the
window cannot reach that alias, the day is refused and bridging stops there.
Neither matters at today's prices, but prices at such levels should be checked
against an exchange, and a floor and a cap that scale with the price are left
for the next version of the method.

Finally, this is slow compared to a lookup. A day is about 144 blocks, which
is a few hundred megabytes through the LND chain backend: tens of seconds per
day with a local full node, minutes per day when blocks have to be fetched
from peers, plus about a second of computation per estimate for the
refinement, its stability variants and the round value comparison. Prices are
remembered precisely so that this cost is only paid once per day.
