import { parse } from './parser';
import { validate } from './validator';
import { execute } from './executor';
import { calculateComplexity, ComplexityOptions } from './complexity';
import { GraphQLSchema, ExecutionResult, ValidationError, DocumentNode } from './types';

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

export interface GraphQLServerOptions {
  schema: GraphQLSchema;
  source: string;
  rootValue?: any;
  contextValue?: any;
  variableValues?: Record<string, any>;
  operationName?: string;
  validationRules?: any[];
  complexityOptions?: ComplexityOptions;
}

export async function graphql(
  options: GraphQLServerOptions
): Promise<ExecutionResult> {
  try {
    const document = parse(options.source);

    const validationErrors = validate(options.schema, document);
    if (validationErrors.length > 0) {
      return { errors: validationErrors };
    }

    if (options.complexityOptions) {
      const complexityResult = calculateComplexity(
        options.schema,
        document,
        options.variableValues,
        options.complexityOptions
      );
      if (complexityResult.errors.length > 0) {
        return {
          errors: complexityResult.errors,
          extensions: {
            complexity: complexityResult.complexity,
            depth: complexityResult.depth
          }
        };
      }
    }

    const result = await execute({
      ...options,
      document
    });

    if (options.complexityOptions) {
      const complexityResult = calculateComplexity(
        options.schema,
        document,
        options.variableValues,
        options.complexityOptions
      );
      result.extensions = {
        complexity: complexityResult.complexity,
        depth: complexityResult.depth
      };
    }

    return result;
  } catch (error) {
    return {
      errors: [{
        message: error instanceof Error ? error.message : String(error)
      }]
    };
  }
}

export { parse, validate, execute, calculateComplexity };
export {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLField,
  GraphQLArgument,
  GraphQLType,
  GraphQLScalarType,
  ExecutionResult,
  ValidationError,
  DocumentNode,
  TypeKind,
  GraphQLFieldResolver,
  BatchLoadFn,
  DataLoaderOptions
} from './types';
export * from './schema';
export { createDataLoader, DataLoaderImpl } from './dataloader';
export type { DataLoader } from './dataloader';
export * from './executor';
export * from './complexity';
export * from './lexer';
export * from './parser';
export * from './validator';
