// Autocomplete suggestions for the inspector's console input.

const MAX_VALUE_PREVIEW = 100;

/** [name, hint] pairs for the property path typed so far (e.g. "cc.director.get"). */
export function codeTip( input: string ): Array<[ string, string ]> {
    if ( input.startsWith( '__' ) ) return [];
    const segments = input.split( '.' );
    let needle = segments.pop() as string;
    if ( needle.includes( '(' ) ) needle = needle.split( '(' )[ 0 ];
    needle = needle.toLowerCase();
    let target: any = ( window as any )[ segments.shift() as string ] || window;
    if ( !target ) return [];
    while ( segments.length > 0 ) {
        const segment = segments.shift() as string;
        if ( !target ) return [];
        target = target[ segment ];
    }
    if ( !target ) return [];

    const tips: Array<[ string, string ]> = [];
    // window/cc own too many properties to enumerate via getOwnPropertyNames
    let names: string[] = target === ( window as any ).cc || target === window ? [] : Object.getOwnPropertyNames( target );
    if ( target.constructor && target.constructor.__props__ ) names.push( ...target.constructor.__props__ );
    const nameSet = new Set( names );
    for ( const key in target ) nameSet.add( key );
    names = Array.from( nameSet );

    for ( const name of names ) {
        if ( name.startsWith( '__' ) ) continue;
        let value = target[ name ];
        if ( needle !== '' && !name.toLowerCase().includes( needle ) ) continue;
        if ( typeof value === 'function' ) {
            if ( value.length === 0 ) {
                tips.push( [ name, 'function()' ] );
                continue;
            }
            const source: string = value.toString();
            let signature = source.split( '\n' ).shift() as string;
            const isNative = source.includes( '[native code]' );
            signature = signature.replace( `function ${ value.name }`, 'function' );
            if ( !signature.endsWith( '{' ) ) {
                const closeBrace = signature.indexOf( '){' );
                const closeSpaceBrace = signature.indexOf( ') {' );
                signature = closeBrace > closeSpaceBrace
                    ? signature.slice( 0, closeBrace + 1 )
                    : signature.slice( 0, 3 );
            } else {
                signature = signature.replace( '{', '' );
            }
            if ( isNative && signature === 'function()' ) {
                signature = 'function(';
                const argNames: string[] = [];
                for ( let index = 1; index <= value.length; index++ ) argNames.push( `arg${ index }` );
                signature += argNames.join( ',' ) + ')';
            }
            tips.push( [ name, signature ] );
        } else if ( typeof value === 'object' ) {
            if ( Array.isArray( value ) ) tips.push( [ name, `[](length:${ value.length })` ] );
            else tips.push( [ name, value === null ? 'null' : ( value.constructor ? value.constructor.name : 'object' ) ] );
        } else {
            value = typeof value === 'string' ? value : String( value );
            if ( value.length > MAX_VALUE_PREVIEW ) value = value.slice( 0, MAX_VALUE_PREVIEW ) + '...';
            tips.push( [ name, `"${ value }"` ] );
        }
    }
    tips.sort();
    tips.sort( ( a, b ) => a[ 0 ].toLowerCase().indexOf( needle ) - b[ 0 ].toLowerCase().indexOf( needle ) );
    return tips;
}
