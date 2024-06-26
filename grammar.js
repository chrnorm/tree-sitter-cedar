// This grammar is loosely inspired by the tree-sitter-go grammar here:
// https://github.com/tree-sitter/tree-sitter-go/blob/master/grammar.js#L22
//
// The Cedar syntax specification can be found here: https://docs.cedarpolicy.com/policies/syntax-grammar.html
//
// Rather than following the Cedar syntax specification exactly as-is, we've made some changes to minimise the
// depth of the parsed syntax tree in Tree-Sitter.

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
        alias($.principal, $.all_principals), // all principals
        $.principal_is_constraint, // principals of a particular type
        $.principal_eq_constraint, // a specific principal
        $.principal_in_constraint, // principals belonging to a hierarchy
        $.principal_eq_template_constraint, // a specific principal (using a policy template)
        $.principal_in_template_constraint, // principals belonging to a hierarchy (using a policy template)
      ),

    principal_is_constraint: ($) =>
      seq("principal", "is", field("right", $.path)),
    principal_eq_constraint: ($) =>
      seq("principal", "==", field("right", $.entity)),
    principal_in_constraint: ($) =>
      seq("principal", "in", field("right", $.entity)),
    principal_eq_template_constraint: ($) =>
      seq("principal", "==", "?principal"),
    principal_in_template_constraint: ($) =>
      seq("principal", "in", "?principal"),

    // Action ::= 'action' [( '==' Entity | 'in' ('[' EntList ']' | Entity) )]
    action_constraint: ($) =>
      choice(
        alias($.action, $.all_actions), // all actions
        $.action_eq_constraint, // a specific action
        $.action_in_constraint, // actions belonging to a hierarchy
        $.action_in_list_constraint, // e.g. `action in [Action::"demo", Action::"other"]`
      ),
    action_eq_constraint: ($) => seq("action", "==", field("right", $.entity)),
    action_in_constraint: ($) => seq("action", "in", field("right", $.entity)),
    action_in_list_constraint: ($) =>
      seq("action", "in", field("right", $.entlist)),

    // Resource ::= 'resource' [(['is' PATH] ['in' (Entity | '?resource')]) | ('==' (Entity | '?resource'))]
    resource_constraint: ($) =>
      choice(
        alias($.resource, $.all_resources), // all resources
        $.resource_is_constraint, // resources of a particular type
        $.resource_eq_constraint, // a specific resource
        $.resource_in_constraint, // resources belonging to a hierarchy
        $.resource_eq_template_constraint, // a specific resource (using a policy template)
        $.resource_in_template_constraint, // resources belonging to a hierarchy (using a policy template)
      ),

    resource_is_constraint: ($) =>
      seq("resource", "is", field("right", $.path)),
    resource_eq_constraint: ($) =>
      seq("resource", "==", field("right", $.entity)),
    resource_in_constraint: ($) =>
      seq("resource", "in", field("right", $.entity)),
    resource_eq_template_constraint: ($) => seq("resource", "==", "?resource"),
    resource_in_template_constraint: ($) => seq("resource", "in", "?resource"),

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
        $.call_expression,
        $.like_expression,
        $.if_then_else,
        $.contains_expression,
        $.contains_all_expression,
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

    call_expression: ($) =>
      prec(
        PREC.primary,
        seq(
          field("function", $._expression),
          field("arguments", $.argument_list),
        ),
      ),

    argument_list: ($) => seq("(", commaSep($._expression), ")"),

    contains_expression: ($) =>
      prec(
        PREC.primary,
        seq(
          field("operand", $._expression),
          ".",
          "contains",
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
          ".",
          "containsAll",
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

    like_expression: ($) =>
      prec(
        PREC.primary,
        seq(field("left", $._expression), "like", field("right", $.str)),
      ),

    is_expression: ($) =>
      prec(
        PREC.primary,
        seq(field("left", $._expression), "is", field("right", $.path)),
      ),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    // Primary ::= LITERAL
    //           | VAR
    //           | Entity
    //           | ExtFun '(' [ExprList] ')'
    //           | '(' Expr ')'
    //           | '[' [ExprList] ']'
    //          | '{' [RecInits] '}'

    expression_list: ($) => commaSep1($._expression),

    // ExtFun '(' [ExprList] ')'
    ext_fun_call: ($) => seq($.path, "(", optional($.expression_list), ")"),

    true: ($) => "true",
    false: ($) => "false",

    unary_expression: ($) =>
      prec(
        PREC.unary,
        seq(
          field("operator", choice("-", "!")),
          field("operand", $._expression),
        ),
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
    entity: ($) => seq(field("type", $.path), `::`, field("id", $.str)),

    // EntList ::= Entity {',' Entity}
    entlist: ($) =>
      seq("[", $.entity, optional(repeat(seq(",", $.entity))), "]"),

    path: ($) => prec.left(PREC.primary, doubleColonSep1($.identifier)),

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

function doubleColonSep1(rule) {
  return seq(rule, repeat(seq("::", rule)));
}

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
