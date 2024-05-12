const PREC = {
  path: 8,
  primary: 7,
  unary: 6,
  multiplicative: 5,
  additive: 4,
  comparative: 3,
  and: 2,
  or: 1,
  composite_literal: -1,
};

const additiveOperators = ["+", "-"];
const relationOperators = ["<", "<=", ">=", ">", "!=", "==", "in"];

module.exports = grammar({
  name: "cedar",

  extras: ($) => [$.comment, /\s/],

  inline: ($) => [$._field_identifier],
  word: ($) => $.identifier,

  supertypes: ($) => [$._expression],

  rules: {
    // TODO: add the actual grammar rules
    source_file: ($) => repeat($._definition),

    _definition: ($) =>
      choice(
        $.policy,
        // TODO: other kinds of definitions
      ),

    // Policy ::= {Annotation} Effect '(' Scope ')' {Conditions} ';'
    policy: ($) =>
      seq(
        repeat($.annotation),
        $.effect,
        "(",
        $.scope,
        ")",
        repeat($.condition),
        ";",
      ),

    scope: ($) =>
      seq(
        $.principal_constraint,
        ",",
        $.action_constraint,
        ",",
        $.resource_constraint,
      ),

    effect: ($) => choice($.permit, $.forbid),

    permit: ($) => "permit",
    forbid: ($) => "forbid",

    // Principal ::= 'principal' [(['is' PATH] ['in' (Entity | '?principal')]) | ('==' (Entity | '?principal'))]
    principal_constraint: ($) =>
      choice(
        $.principal, // all principals
        $.principal_is_constraint, // principals of a particular type
        $.principal_eq_constraint, // a specific principal
        $.principal_in_constraint, // principals belonging to a hierarchy
        $.principal_eq_template_constraint, // a specific principal (using a policy template)
        $.principal_in_template_constraint, // principals belonging to a hierarchy (using a policy template)
      ),

    principal_is_constraint: ($) => seq($.principal, "is", $.path),
    principal_eq_constraint: ($) => seq($.principal, "==", $.entity),
    principal_in_constraint: ($) => seq($.principal, "in", $.entity),
    principal_eq_template_constraint: ($) =>
      seq($.principal, "==", "?principal"),
    principal_in_template_constraint: ($) =>
      seq($.principal, "in", "?principal"),

    // Action ::= 'action' [( '==' Entity | 'in' ('[' EntList ']' | Entity) )]
    action_constraint: ($) =>
      choice(
        $.action, // all actions
        $.action_eq_constraint, // a specific action
        $.action_in_constraint, // actions belonging to a hierarchy
        $.action_in_list_constraint, // e.g. `action in [Action::"demo", Action::"other"]`
      ),
    action_eq_constraint: ($) => seq($.action, "==", $.entity),
    action_in_constraint: ($) => seq($.action, "in", $.entity),
    action_in_list_constraint: ($) => seq($.action, "in", $.entlist),

    // Resource ::= 'resource' [(['is' PATH] ['in' (Entity | '?resource')]) | ('==' (Entity | '?resource'))]
    resource_constraint: ($) =>
      choice(
        $.resource, // all resources
        $.resource_is_constraint, // resources of a particular type
        $.resource_eq_constraint, // a specific resource
        $.resource_in_constraint, // resources belonging to a hierarchy
        $.resource_eq_template_constraint, // a specific resource (using a policy template)
        $.resource_in_template_constraint, // resources belonging to a hierarchy (using a policy template)
      ),

    resource_is_constraint: ($) => seq($.resource, "is", $.path),
    resource_eq_constraint: ($) => seq($.resource, "==", $.entity),
    resource_in_constraint: ($) => seq($.resource, "in", $.entity),
    resource_eq_template_constraint: ($) => seq($.resource, "==", "?resource"),
    resource_in_template_constraint: ($) => seq($.resource, "in", "?principal"),

    // Condition ::= ('when' | 'unless') '{' Expr '}'
    condition: ($) => seq(choice($.when, $.unless), "{", $._expression, "}"),

    // Expr ::= Or | 'if' Expr 'then' Expr 'else' Expr
    _expression: ($) =>
      choice(
        $.unary_expression,
        $.binary_expression,
        $.index_expression,
        $.parenthesized_expression,
        $.selector_expression,
        $.has_expression,
        $.is_expression,
        $.if_then_else,
        $.contains_expression,
        $.contains_all_expression,
        $.ip_function_call,
        $.ext_fun_call,
        $.entity,
        $.entlist,
        $.set_literal,
        $.record_literal,
        $.principal,
        $.action,
        $.resource,
        $.context,
        $.true,
        $.false,
        $.int,
        $.str,
      ),

    record_attribute: ($) =>
      prec(
        PREC.primary,
        seq(
          field("key", choice($.str, $.identifier)),
          ":",
          field("value", $._literal),
        ),
      ),

    _literal: ($) => choice($.true, $.false, $.int, $.str),

    record_literal: ($) =>
      prec(PREC.primary, seq("{", commaSep($.record_attribute), "}")),

    set_literal: ($) => prec(PREC.primary, seq("[", commaSep($._literal), "]")),

    index_expression: ($) =>
      prec(
        PREC.primary,
        seq(
          field("operand", $._expression),
          "[",
          field("index", $._expression),
          "]",
        ),
      ),

    binary_expression: ($) => {
      const table = [
        [PREC.multiplicative, "*"],
        [PREC.additive, choice(...additiveOperators)],
        [PREC.comparative, choice(...relationOperators)],
        [PREC.and, "&&"],
        [PREC.or, "||"],
      ];

      return choice(
        ...table.map(([precedence, operator]) =>
          prec.left(
            precedence,
            seq(
              field("left", $._expression),
              field("operator", operator),
              field("right", $._expression),
            ),
          ),
        ),
      );
    },

    ip_function_call: ($) =>
      prec(
        PREC.primary,
        seq(
          field("operand", $._expression),
          choice(".isIpv4()", ".isIpv6()", ".isLoopback()", ".isMulticast()"),
        ),
      ),

    contains_expression: ($) =>
      prec(
        PREC.primary,
        seq(
          field("operand", $._expression),
          ".contains",
          "(",
          field("field", $._expression),
          ")",
        ),
      ),

    contains_all_expression: ($) =>
      prec(
        PREC.primary,
        seq(
          field("operand", $._expression),
          ".containsAll",
          "(",
          field("field", $._expression),
          ")",
        ),
      ),

    selector_expression: ($) =>
      prec(
        PREC.primary,
        seq(
          field("operand", $._expression),
          ".",
          field("field", $._field_identifier),
        ),
      ),

    if_then_else: ($) =>
      seq(
        "if",
        field("if", $._expression),
        "then",
        field("then", $._expression),
        "else",
        field("else", $._expression),
      ),

    has_expression: ($) =>
      prec(
        PREC.primary,
        seq(
          field("operand", $._expression),
          "has",
          field("field", choice($.str, $._field_identifier)),
        ),
      ),

    is_expression: ($) =>
      prec(
        PREC.primary,
        seq(field("left", $._expression), "is", field("right", $.path)),
      ),

    // Or ::= And {'||' And}
    or: ($) => seq($.and, optional(seq("||", $.and))),

    // And ::= Relation {'&&' Relation}
    and: ($) => seq($.relation, optional(seq("&&", $.relation))),

    // Relation ::= Add [RELOP Add] | Add 'has' (IDENT | STR) | Add 'like' PAT | Add 'is' Path ('in' Add)?
    relation: ($) => $.add, // todo

    // Add ::= Mult {('+' | '-') Mult}
    add: ($) => seq($.mult, optional(seq(choice("+", "-"), $.mult))),

    // Mult ::= Unary { '*' Unary}
    mult: ($) => seq($.unary, optional(seq("*", $.unary))),

    // Unary ::= ['!' | '-']x4 Member
    unary: ($) => seq($.member),

    // Member ::= Primary {Access}
    member: ($) => seq($.primary),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    // Primary ::= LITERAL
    //           | VAR
    //           | Entity
    //           | ExtFun '(' [ExprList] ')'
    //           | '(' Expr ')'
    //           | '[' [ExprList] ']'
    //          | '{' [RecInits] '}'
    primary: ($) =>
      choice($.literal, $.principal, $.resource, $.action, $.context, $.entity),

    expression_list: ($) => commaSep1($._expression),

    // ExtFun '(' [ExprList] ')'
    ext_fun_call: ($) => seq($.path, "(", optional($.expression_list), ")"),

    // // ExtFun ::= [Path '::'] IDENT
    // ext_fun: ($) =>
    //   prec.left(PREC.primary, seq(optional(seq($.path, "::")), $.identifier)),

    // LITERAL ::= BOOL | INT | STR
    literal: ($) => choice($.true, $.false),

    true: ($) => "true",
    false: ($) => "false",

    unary_expression: ($) =>
      prec(
        PREC.unary,
        seq(field("operator", choice("-", "!")), field("operand", $.member)),
      ),

    // Annotation ::= '@'IDENT'('STR')'
    //
    // Note: this is currently relaxed on whitespace, so
    // a string like `@ myannotation ( "example" )` will be parsed without errors.
    //
    // We need to check this against the Cedar Rust / Go implementations to
    // verify the behaviour is the same.
    annotation: ($) => seq("@", $.identifier, "(", $.str, ")"),

    // Entity ::= Path '::' STR
    entity: ($) => seq($.path, `::"`, $.identifier, `"`),

    // EntList ::= Entity {',' Entity}
    entlist: ($) =>
      seq("[", $.entity, optional(repeat(seq(",", $.entity))), "]"),

    path: ($) => seq(optional(repeat(seq($.identifier, "::"))), $.identifier),

    principal: ($) => "principal",
    action: ($) => "action",
    resource: ($) => "resource",
    context: ($) => "context",

    when: ($) => "when",
    unless: ($) => "unless",

    _field_identifier: ($) => alias($.identifier, $.field_identifier),

    // IDENT ::= ['_''a'-'z''A'-'Z']['_''a'-'z''A'-'Z''0'-'9']* - RESERVED
    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    // STR ::= Fully-escaped Unicode surrounded by '"'s
    str: ($) => token(seq(`"`, /.*/, `"`)),

    // INT ::= '-'? ['0'-'9']+
    int: ($) => token(/-?[0-9]+/),

    comment: ($) => token(seq("//", /.*/)),
  },
});

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @return {SeqRule}
 *
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @return {ChoiceRule}
 *
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}
