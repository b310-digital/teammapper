## ADDED Requirements

### Requirement: Branch style user setting

The user settings SHALL hold a `branchStyle` with one of the values `tapered`, `curved` or `straight`. The server default SHALL be `tapered`. A missing or unknown value SHALL be treated as `tapered` without logging an error. The setting SHALL be stored only in the user's browser and SHALL NOT be synced to other clients or stored with the map.

#### Scenario: First visit uses the default

- **WHEN** a user without cached settings opens a map
- **THEN** every branch SHALL be drawn in the `tapered` style

#### Scenario: Cached settings from before this change

- **WHEN** a user whose cached settings contain no `branchStyle` opens a map
- **THEN** every branch SHALL be drawn exactly as before this change

#### Scenario: Setting applies to every map

- **WHEN** a user has chosen `curved` and opens any map
- **THEN** that map SHALL be drawn with curved branches

#### Scenario: Setting survives a reload

- **WHEN** a user chooses a branch style and reloads the page
- **THEN** the chosen style SHALL still apply

#### Scenario: Collaborators keep their own style

- **WHEN** user A chooses `straight` while user B has the default and both have the same map open
- **THEN** user A SHALL see straight branches
- **AND** user B SHALL still see tapered branches

### Requirement: Rendering per branch style

The renderer SHALL draw every branch in the user's branch style. The branch SHALL keep its branch color in every style.

#### Scenario: Tapered style

- **WHEN** the branch style is `tapered`
- **THEN** each branch SHALL be a filled shape in the branch color that narrows with the node's level

#### Scenario: Curved style

- **WHEN** the branch style is `curved`
- **THEN** each branch SHALL be an open curve with no fill, stroked in the branch color
- **AND** the stroke SHALL be 2.5px wide at every level, with round line caps

#### Scenario: Straight style

- **WHEN** the branch style is `straight`
- **THEN** each branch SHALL be a straight segment from the parent's center to the child's center, with no fill, stroked in the branch color
- **AND** the stroke SHALL be 2.5px wide at every level, with round line caps

#### Scenario: Branch color change

- **WHEN** the branch style is `curved` or `straight` and a node's branch color changes
- **THEN** the branch stroke SHALL take the new color and the fill SHALL stay none

#### Scenario: Detached node

- **WHEN** a node is detached
- **THEN** no branch SHALL be drawn to it, whatever the branch style
